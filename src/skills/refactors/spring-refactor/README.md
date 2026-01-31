# Spring Refactor

Intelligent Spring Boot code refactoring tool with pattern detection and best practices enforcement.

## Features

- **Code Analysis**: Detect anti-patterns and code smells
- **Refactoring Patterns**: 20+ proven refactoring techniques
- **Spring Best Practices**: Framework-specific recommendations
- **Interactive Apply**: Safe, step-by-step refactoring

## Tools

### `analyze`
Analyze code for refactoring opportunities.

```bash
spring-refactor-analyze target_path="/path/to/project"
```

### `apply`
Apply refactoring patterns interactively.

```bash
spring-refactor-apply target_path="/path/to/project" pattern="extract-method"
```

## Refactoring Patterns

- Extract Method
- Extract Class
- Replace Conditional with Polymorphism
- Introduce Parameter Object
- Replace Magic Numbers
- Decompose Conditional
- Extract Interface
- Move Method
- And more...

## Example

```bash
# Analyze a Spring project
spring-refactor-analyze target_path="~/workspace/my-spring-app"

# Apply a specific pattern
spring-refactor-apply target_path="~/workspace/my-spring-app" pattern="extract-method"
```
