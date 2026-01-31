# Java Architect

Enterprise Java architecture review with comprehensive analysis of design patterns, SOLID principles, and best practices.

## Features

- **Layer Analysis**: Review presentation, business, persistence, and integration layers
- **SOLID Assessment**: Score adherence to SOLID principles
- **Design Patterns**: Identify patterns and anti-patterns
- **Clean Architecture**: Verify clean architecture principles
- **DDD Review**: Domain-driven design assessment

## Tools

### `review`
Comprehensive architecture review of Java projects.

```bash
java-architect-review target_path="/path/to/project" scope="full"
```

**Scopes**:
- `full`: Complete architecture review (default)
- `layered`: Focus on layer separation
- `domain`: Focus on domain design
- `integration`: Focus on integration points

### `check-principles`
Check SOLID and design principle adherence.

```bash
java-architect-check-principles target_path="/path/to/project"
```

## Review Dimensions

1. **Presentation Layer**: Controllers, DTOs, validation
2. **Business Layer**: Services, domain logic, transactions
3. **Persistence Layer**: Repositories, entities, queries
4. **Integration Layer**: APIs, messaging, resilience
5. **SOLID Principles**: SRP, OCP, LSP, ISP, DIP
6. **Design Patterns**: Gang of Four, Enterprise patterns
7. **Clean Architecture**: Dependency rules, boundaries

## Example

```bash
# Full architecture review
java-architect-review target_path="~/workspace/my-app"

# Check SOLID principles
java-architect-check-principles target_path="~/workspace/my-app"
```
