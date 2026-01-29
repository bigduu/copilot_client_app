## ADDED Requirements

### Requirement: Mask Outbound Message Content

The application SHALL apply global keyword masking to all ChatCompletionRequest message content before forwarding to the Copilot API.

#### Scenario: Mask exact keyword in a message

- **GIVEN** a message contains the substring `secret-token` and an enabled `exact` keyword entry for `secret-token`
- **WHEN** the request payload is assembled
- **THEN** the outbound message content replaces each occurrence with `[MASKED]`

#### Scenario: Mask regex keyword in a message

- **GIVEN** a message contains text matching the regex pattern `sk-[A-Za-z0-9]+`
- **AND** an enabled `regex` keyword entry for that pattern exists
- **WHEN** the request payload is assembled
- **THEN** the outbound message content replaces each regex match with `[MASKED]`

#### Scenario: Skip disabled keywords

- **GIVEN** a keyword entry is marked disabled
- **WHEN** the request payload is assembled
- **THEN** the disabled entry is not applied to message content

### Requirement: Deterministic Masking Order

The application SHALL apply keyword entries in the configured order so masking results are deterministic.

#### Scenario: Overlapping keyword entries

- **GIVEN** two enabled keyword entries where one pattern overlaps another
- **WHEN** the request payload is assembled
- **THEN** the masking applies in list order and each subsequent entry operates on the already masked text
