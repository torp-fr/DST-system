```markdown
# CRBR-Solution Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the CRBR-Solution Python codebase. You will learn about file naming, import/export styles, commit message patterns, and how to structure and run tests. This guide is ideal for contributors looking to maintain consistency and quality in this repository.

## Coding Conventions

### File Naming
- Use `snake_case` for all file names.
  - **Example:**  
    `data_processor.py`  
    `user_profile_manager.py`

### Import Style
- Use **relative imports** within the package.
  - **Example:**  
    ```python
    from .utils import calculate_score
    from ..models.user import User
    ```

### Export Style
- Use **named exports** (explicitly define what is exported).
  - **Example:**  
    ```python
    __all__ = ['DataProcessor', 'process_data']
    ```

### Commit Messages
- Freeform style, no enforced prefixes.
- Average commit message length: 59 characters.
  - **Example:**  
    `Fix bug in user authentication logic`

## Workflows

### Adding a New Module
**Trigger:** When you need to add new functionality as a module  
**Command:** `/add-module`

1. Create a new Python file using `snake_case` (e.g., `new_feature.py`).
2. Implement your functionality.
3. Use relative imports to access shared code.
4. Define `__all__` to specify exports.
5. Add or update tests in a corresponding `*.test.*` file.
6. Commit changes with a clear, descriptive message.

### Writing and Running Tests
**Trigger:** When you add or update code and need to ensure correctness  
**Command:** `/run-tests`

1. Create or update test files matching the pattern `*.test.*` (e.g., `data_processor.test.py`).
2. Write tests for your new or changed functionality.
3. Use the project's preferred (unknown) testing framework.
4. Run all tests to verify correctness.
5. Fix any failing tests before committing.

### Refactoring Code
**Trigger:** When improving or restructuring existing code  
**Command:** `/refactor`

1. Identify code to refactor.
2. Make changes while following file naming and import conventions.
3. Update any affected tests.
4. Run all tests to ensure nothing is broken.
5. Commit with a message describing the refactor.

## Testing Patterns

- Test files follow the pattern `*.test.*` (e.g., `module.test.py`).
- The specific testing framework is not enforced or detected.
- Place tests close to the code they cover for clarity.
- Ensure all new features and bug fixes are covered by tests.

**Example test file:**
```python
# data_processor.test.py

from .data_processor import process_data

def test_process_data_valid_input():
    assert process_data([1, 2, 3]) == [2, 3, 4]
```

## Commands
| Command      | Purpose                                   |
|--------------|-------------------------------------------|
| /add-module  | Scaffold and add a new module             |
| /run-tests   | Run all tests in the repository           |
| /refactor    | Refactor code while maintaining standards |
```
