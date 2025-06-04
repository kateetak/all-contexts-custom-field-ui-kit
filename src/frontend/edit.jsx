import React, { useState, useCallback, useEffect } from 'react';
import ForgeReconciler, { Select } from '@forge/react';
import { CustomFieldEdit } from '@forge/react/jira';
import { view, invoke } from '@forge/bridge';

const DEFAULT_LIMIT = 20;

const Edit = () => {
  const [value, setValue] = useState('');
  const [allOptions, setAllOptions] = useState([]); // Store all options
  const [selectOptions, setSelectOptions] = useState([
    { label: 'Loading...', value: '' }
  ]);

  // Fetch all options once on mount
  useEffect(() => {
    const fetchOptions = async () => {
      const options = await invoke('get-contexts');
      const mappedOptions = Array.isArray(options)
        ? options.map(opt => ({ label: opt, value: opt }))
        : [];
      setAllOptions(mappedOptions);
      setSelectOptions(mappedOptions.slice(0, DEFAULT_LIMIT));
      console.log('Fetched all options from backend:', options);
      console.table(mappedOptions);
    };
    fetchOptions();
  }, []);

  // Filter options in the frontend
  const handleInputChange = useCallback((inputValue) => {
    if (!inputValue) {
      setSelectOptions(allOptions.slice(0, DEFAULT_LIMIT));
      return;
    }
    const filtered = allOptions.filter(opt =>
      opt.label.toLowerCase().includes(inputValue.trim().toLowerCase())
    );
    setSelectOptions(filtered.slice(0, DEFAULT_LIMIT));
    console.log('Filtered options for input:', inputValue, filtered.slice(0, DEFAULT_LIMIT));
  }, [allOptions]);

  const onSubmit = useCallback(async () => {
    try {
      await view.submit(value);
    } catch (e) {
      console.error(e);
    }
  }, [view, value]);

  const handleOnChange = useCallback((e) => {
    setValue(e.value);
  }, []);

  return (
    <CustomFieldEdit onSubmit={onSubmit} hideActionButtons>
      <Select
        appearance="default"
        options={selectOptions}
        onChange={handleOnChange}
        onInputChange={handleInputChange}
        isClearable={true}
      />
    </CustomFieldEdit>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <Edit />
  </React.StrictMode>
);