# Questions
- Is the label list going to be above the 240KiB limit (https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/#kvs-and-custom-entity-store-limits)? If yes, options are:
    - compress the data using a compression algorithm (e.g. zlib) before storing it and decompressing it when retrieving it
    - store the data in multiple keys and retrieve them all when needed
- Is there a limit to the number of items that can be added to a list (10k)?


# Known Issues


# Improvements
# Must Have
- [MUST HAVE] Add an environment variable to set the customFieldId
- [MUST HAVE] Filter labels in the frontend

# Nice to Have
- [nice to have] Only use one queue (not two) - merge load-contexts and load-context-options
- [nice to have] [non trivial] Listen to the https://developer.atlassian.com/platform/forge/events-reference/jira/#custom-field-context-configuration-events | Would require managing race conditions when multiple users are changing the context at the same time