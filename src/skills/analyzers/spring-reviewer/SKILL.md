# Spring Reviewer

Advanced SpringBoot code auditor combining static analysis (PMD) with LLM semantic understanding to detect critical bugs, Spring AOP failures, and architectural anti-patterns.

## What it does

- **Critical Bug Detection**: NPE risks, array bounds issues, thread-safety violations, resource leaks
- **Spring AOP Analysis**: Detects proxy failures (self-invocation, private methods, final classes)
- **Database & ORM**: N+1 queries, transaction boundaries, lazy loading issues, missing pagination
- **Message Queue Reliability**: Consumer idempotency, error handling, DLQ configuration
- **Caching Strategies**: Cache penetration/avalanche prevention, key design validation
- **Advanced Concurrency**: ThreadLocal leaks, @Async exception handling, scheduled job overlap
- **Distributed Systems**: Circuit breaker patterns, Feign fallbacks, timeout configuration
- **Best Practices Enforcement**: Constructor injection, centralized exception handling, configuration externalization
- **Automated Tooling**: Self-bootstrapping PMD integration with curated rule sets

## When to use

Use this skill when:
- Reviewing Spring Boot code for production readiness
- Auditing code for Spring AOP annotation misuse (@Transactional, @Async, @Cacheable)
- Finding potential NPE, array bounds, or concurrency bugs
- Detecting N+1 query problems and ORM performance issues
- Ensuring message queue consumer idempotency and error handling
- Validating caching strategies (penetration/avalanche prevention)
- Checking distributed system resilience (circuit breakers, timeouts)
- Preventing ThreadLocal leaks and async exception swallowing
- Enforcing Spring architectural best practices
- Need both static analysis and semantic understanding

## How to use

```bash
# Analyze a single file
/spring-reviewer path/to/MyService.java

# Analyze a directory
/spring-reviewer src/main/java/com/example/

# Analyze with custom PMD rules
/spring-reviewer src/ --rules custom-rules.xml

# Generate detailed report
/spring-reviewer src/ --detailed
```

## Output format

The skill produces a structured report with:

- **🛑 CRITICAL**: Fatal bugs (NPE, bounds, concurrency)
- **⚠️ PROXY WARNING**: AOP effectiveness issues
- **💡 BEST PRACTICE**: Architecture improvement suggestions

Each issue includes:
- File path and line number
- Rule violated
- Problematic code snippet
- Refactored code example
- Explanation of why it's problematic

## Requirements

- Java 8+ source code
- Internet connection (for first-time PMD download)
- Python 3.6+ or Bash shell

## Configuration

Custom PMD rules can be provided via `--rules` parameter. Default uses `critical-rules.xml` focusing on:
- java-errorprone
- java-bestpractices
- java-multithreading
