# Spring Reviewer 🔍

Advanced SpringBoot code auditor combining static analysis (PMD) with LLM semantic understanding to detect critical bugs, Spring AOP proxy failures, and architectural anti-patterns.

## 🎯 Features

### 1. Critical Bug Detection
- **Null Pointer Exceptions**: NullAssignment, BrokenNullCheck, MisplacedNullCheck
- **Array/Collection Issues**: IndexOutOfBounds, ArrayStoredDirectly
- **Concurrency Bugs**: NonThreadSafeSingleton, UnsynchronizedStaticFormatter, DoubleCheckedLocking
- **Resource Leaks**: Unclosed files, streams, database connections
- **Logic Errors**: UnconditionalIfStatement, JumbledIncrementer, BadComparison

### 2. Spring AOP Proxy Analysis
- **Self-Invocation Detection**: Identifies when methods call other AOP-annotated methods within the same class, causing proxy bypass
- **Access Modifier Violations**: Detects AOP annotations on private/final methods that will be ignored
- **Lifecycle Issues**: Finds AOP method calls in constructors before proxy initialization
- **Annotations Checked**: `@Transactional`, `@Async`, `@Cacheable`, `@CachePut`, `@CacheEvict`

### 3. Database & ORM Optimization
- **N+1 Query Detection**: Identifies repository calls in loops causing performance issues
- **Transaction Boundaries**: Detects missing or incorrectly configured `@Transactional`
- **Lazy Loading Issues**: Finds lazy-loaded collections accessed outside transactions
- **Pagination**: Ensures large datasets use `Pageable` to prevent OOM errors

### 4. Message Queue Reliability
- **Consumer Idempotency**: Validates message handlers can safely process duplicates
- **Error Handling**: Ensures `@KafkaListener`/`@RabbitListener` have proper exception handling
- **DLQ Configuration**: Checks for dead letter queue patterns for failed messages
- **Acknowledgment Modes**: Validates proper manual vs auto-ack configuration

### 5. Caching Strategies
- **Cache Penetration**: Detects `@Cacheable` returning null (non-existent data bypassing cache)
- **Cache Avalanche**: Identifies synchronized expiration risks
- **Key Design**: Validates explicit cache key specifications
- **Eviction Patterns**: Ensures bulk operations use `allEntries=true`

### 6. Advanced Concurrency
- **ThreadLocal Leaks**: Detects missing `remove()` calls in thread pool environments
- **Async Exception Handling**: Finds `@Async` void methods that swallow exceptions
- **Scheduled Job Overlap**: Identifies `fixedRate` jobs that may run concurrently
- **CompletableFuture**: Ensures proper exception handling in async chains

### 7. Distributed Systems
- **Circuit Breakers**: Validates `@FeignClient` has fallback mechanisms
- **Timeout Configuration**: Ensures `RestTemplate` has connection/read timeouts
- **Service Degradation**: Checks for graceful fallback patterns

### 8. Bean Lifecycle & Dependency Management (Phase 2)
- **Prototype Injection**: Detects prototype beans injected into singletons
- **Initialization Order**: Validates `@PostConstruct` dependency availability
- **Circular Dependencies**: Identifies constructor injection cycles
- **Scope Misuse**: Finds stateful beans in singleton scope

### 9. Advanced Transaction Patterns (Phase 2)
- **Isolation Levels**: Validates appropriate isolation for financial operations
- **Timeout Configuration**: Ensures long-running transactions have timeouts
- **Rollback Strategy**: Checks checked exceptions have `rollbackFor`
- **Read-only Optimization**: Detects missing `readOnly=true` on queries

### 10. Spring Events & Transactions (Phase 2)
- **Event Phases**: Validates `@TransactionalEventListener` phase configuration
- **Compensation Logic**: Ensures `AFTER_COMMIT` has error handling
- **Async Context**: Detects transaction context loss in async listeners

### 11. Transaction Message Patterns (Phase 2)
- **Local Message Table**: Validates transactional outbox implementation
- **Synchronization Manager**: Checks `TransactionSynchronizationManager` usage
- **Ghost Messages**: Prevents messages sent before transaction commit

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/zmlio/spring-reviewer.git
cd spring-reviewer

# Bootstrap PMD (automatically downloads if missing)
python3 scripts/pmd-bootstrap.py

# Or use bash version
bash scripts/pmd-bootstrap.sh
```

### Usage

#### Analyze a Single File
```bash
python3 scripts/pmd-bootstrap.py src/main/java/com/example/UserService.java
```

#### Analyze a Directory
```bash
python3 scripts/pmd-bootstrap.py src/main/java/
```

#### Use Custom Rules
```bash
python3 scripts/pmd-bootstrap.py src/ config/spring-aop-rules.xml
```

#### Bash Script Usage
```bash
# Analyze with default critical rules
bash scripts/pmd-bootstrap.sh src/main/java/

# Analyze with custom rules
bash scripts/pmd-bootstrap.sh src/main/java/ config/spring-aop-rules.xml
```

## 📋 Output Format

Results are structured in three severity levels:

### 🛑 CRITICAL ISSUES
Fatal bugs that can cause production failures:
- NullPointerException risks
- Array index out of bounds
- Thread-safety violations
- Resource leaks

### ⚠️ PROXY WARNINGS
Spring AOP effectiveness issues that silently fail:
- Self-invocation bypassing `@Transactional`
- Private methods with `@Async` (ignored)
- Final methods/classes preventing proxying
- Constructor calls before proxy initialization

### 💡 BEST PRACTICE SUGGESTIONS
Architectural improvements:
- Constructor injection vs field injection
- Centralized exception handling
- Configuration externalization
- Pagination for large datasets

### Example Output

```json
[
  {
    "file": "src/main/java/com/example/OrderService.java",
    "line": 45,
    "endLine": 47,
    "rule": "AvoidTransactionalOnPrivateMethod",
    "ruleSet": "Spring AOP Custom Rules",
    "priority": 1,
    "description": "@Transactional on private method will be ignored by Spring AOP",
    "externalInfoUrl": "https://docs.spring.io/spring-framework/docs/current/reference/html/data-access.html#transaction"
  }
]
```

## 🛠️ Configuration

### PMD Rules

Two rule sets are included:

1. **`config/critical-rules.xml`** (Default)
   - Focused on high-severity bugs
   - Low false-positive rate
   - Recommended for CI/CD pipelines

2. **`config/spring-aop-rules.xml`** (Spring-Specific)
   - Custom XPath rules for Spring patterns
   - AOP proxy failure detection
   - Spring best practices enforcement

### Customization

Create your own ruleset by extending the base configurations:

```xml
<?xml version="1.0"?>
<ruleset name="My Custom Rules">
    <!-- Include critical rules -->
    <rule ref="config/critical-rules.xml"/>

    <!-- Include Spring AOP rules -->
    <rule ref="config/spring-aop-rules.xml"/>

    <!-- Add your custom rules -->
    <rule name="MyCustomRule" ...>
        ...
    </rule>
</ruleset>
```

## 🔧 Requirements

- **Java**: JDK 8 or higher (to run PMD)
- **Python**: 3.6+ (for Python bootstrap script)
- **Bash**: 4.0+ (for shell script)
- **Tools**: `curl`/`wget`, `unzip` (auto-installed on most systems)

## 📚 How It Works

### 1. Static Analysis Layer (PMD)
The bootstrap scripts automatically:
- Download PMD from GitHub releases
- Extract and configure the tool
- Run analysis with curated rule sets
- Output structured JSON results

### 2. Semantic Analysis Layer (LLM)
For complex patterns beyond static analysis:
- Build call graphs from method invocations
- Map Spring annotation relationships
- Detect self-invocation through symbolic execution
- Understand transaction boundary semantics

### 3. Report Generation
Combine both layers into actionable reports:
- File paths and line numbers
- Before/after code examples
- Explanations of underlying mechanisms
- Prioritized remediation steps

## 🎓 Examples & Patterns

### Spring AOP Issues

#### Self-Invocation Bypass
```java
// ❌ PROXY BYPASS
@Service
public class OrderService {
    public void createOrder() {
        processPayment(); // Calls 'this.processPayment()' - no proxy!
    }

    @Transactional
    private void processPayment() {
        // Transaction not started!
    }
}
```

**Root Cause**: Spring AOP creates a proxy wrapper. Internal `this.method()` calls bypass the proxy.

**Solution**: Extract to a separate service.

### Database & ORM

#### N+1 Query Problem
```java
// ❌ BAD - 101 queries for 100 orders
@Service
public class OrderService {
    public List<OrderDTO> getAllOrders() {
        List<Order> orders = orderRepo.findAll(); // Query 1
        return orders.stream().map(order -> {
            List<Item> items = itemRepo.findByOrderId(order.getId()); // N queries!
            return new OrderDTO(order, items);
        }).collect(toList());
    }
}

// ✅ GOOD - Single query with JOIN FETCH
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {
    @Query("SELECT DISTINCT o FROM Order o LEFT JOIN FETCH o.items")
    List<Order> findAllWithItems();
}
```

### Message Queue Reliability

#### Idempotent Consumer
```java
// ❌ BAD - Duplicate messages create duplicate orders
@KafkaListener(topics = "orders")
public void processOrder(OrderMessage msg) {
    orderRepo.save(new Order(msg.getId(), msg.getAmount()));
}

// ✅ GOOD - Check before processing
@KafkaListener(topics = "orders")
@Transactional
public void processOrder(OrderMessage msg) {
    if (orderRepo.existsById(msg.getId())) {
        return; // Already processed
    }
    orderRepo.save(new Order(msg.getId(), msg.getAmount()));
}
```

### Caching Strategy

#### Cache Penetration Prevention
```java
// ❌ BAD - Non-existent data bypasses cache
@Cacheable("users")
public User getUser(Long id) {
    return userRepo.findById(id).orElse(null); // null not cached!
}

// ✅ GOOD - Cache empty results
@Cacheable(value = "users", key = "#id")
public Optional<User> getUser(Long id) {
    return userRepo.findById(id); // Optional.empty() is cached
}
```

### Advanced Concurrency

#### ThreadLocal Cleanup
```java
// ❌ BAD - Memory leak in thread pool
@Async
public void processRequest(Long userId) {
    currentUser.set(userRepo.findById(userId).orElseThrow());
    doWork();
    // ThreadLocal never removed!
}

// ✅ GOOD - Always cleanup
@Async
public void processRequest(Long userId) {
    try {
        currentUser.set(userRepo.findById(userId).orElseThrow());
        doWork();
    } finally {
        currentUser.remove();
    }
}
```

### Bean Lifecycle (Phase 2)

#### Prototype Injection Issue
```java
// ❌ BAD - Prototype becomes singleton
@Component
@Scope("prototype")
class StatefulProcessor { /* stateful */ }

@Service
public class OrderService {
    @Autowired
    private StatefulProcessor processor; // Only ONE instance!
}

// ✅ GOOD - Use ObjectProvider
@Service
public class OrderService {
    @Autowired
    private ObjectProvider<StatefulProcessor> provider;
    
    public void process() {
        StatefulProcessor p = provider.getObject(); // New instance!
        p.doWork();
    }
}
```

### Transaction Patterns (Phase 2)

#### Checked Exception Rollback
```java
// ❌ CRITICAL - Checked exceptions don't rollback!
@Transactional
public void createOrder(Order order) throws BusinessException {
    orderRepo.save(order);
    if (!inventory.reserve()) {
        throw new BusinessException(); // Transaction COMMITS!
    }
}

// ✅ GOOD - Explicit rollbackFor
@Transactional(rollbackFor = BusinessException.class)
public void createOrder(Order order) throws BusinessException {
    orderRepo.save(order);
    if (!inventory.reserve()) {
        throw new BusinessException(); // Transaction ROLLS BACK
    }
}
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new rules
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [PMD](https://pmd.github.io/) - Static code analyzer
- [Spring Framework](https://spring.io/) - Reference implementation
- [Spring AOP Documentation](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#aop) - AOP concepts

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/zmlio/spring-reviewer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/zmlio/spring-reviewer/discussions)
- **Documentation**: [Wiki](https://github.com/zmlio/spring-reviewer/wiki)

---

**Made with ❤️ for the Spring Boot community**
