import React, { useState, useCallback, useEffect } from 'react';
import ForgeReconciler, { Select } from '@forge/react';
import { CustomFieldEdit } from '@forge/react/jira';
import { view, invoke } from '@forge/bridge';

const Edit = () => {
  const [value, setValue] = useState('');
  const [selectOptions, setSelectOptions] = useState([
    { label: 'Loading...', value: '' }
  ]);

  useEffect(() => {
    const fetchOptions = async () => {
      const options = await invoke('get-contexts');
      const mappedOptions = Array.isArray(options)
        ? options.map(opt => ({ label: opt, value: opt }))
        : [{ label: 'No options found', value: '' }];
      console.log('Fetched raw options from backend:', options);
      console.table(mappedOptions);
      setSelectOptions(mappedOptions);
    };
    fetchOptions();
  }, []);

  // Load options on input change
  const handleInputChange = useCallback(async (inputValue) => {
    const options = await invoke('get-contexts', { query: inputValue });
    const mappedOptions = Array.isArray(options)
      ? options.map(opt => ({ label: opt, value: opt }))
      : [{ label: 'No options found', value: '' }];
    console.log('Fetched raw options from backend:', options);
    console.table(mappedOptions);
    setSelectOptions(mappedOptions);
  }, []);

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