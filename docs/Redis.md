# Omega MVC — Redis Package Manual

The `Omega\Redis` package provides a Redis client abstraction built on top of
the `phpredis` PHP extension. It includes a `RedisManager` for driver/connection
management, a `Redis` connection wrapper, and a service provider that binds
everything into the application container.

## Configuration

Redis configuration lives under the `redis` key:

```php
// config/redis.php
return [
    'default' => 'default',
    'connections' => [
        'default' => [
            'host'     => '127.0.0.1',
            'port'     => 6379,
            'timeout'  => 0.0,
            'password' => null,
            'database' => 0,
        ],
        'cache' => [
            'host'     => '127.0.0.1',
            'port'     => 6379,
            'database' => 1,
        ],
    ],
];
```

Connection options:

| Key | Type | Default | Description |
| --- | ---- | ------- | ----------- |
| `host` | `string` | `127.0.0.1` | Redis server hostname |
| `port` | `int` | `6379` | Redis server port |
| `timeout` | `float` | `0.0` | Connection timeout in seconds |
| `retry_interval` | `int` | `0` | Retry interval for connecting |
| `read_timeout` | `float` | `0.0` | Read timeout (set via `OPT_READ_TIMEOUT`) |
| `persistent` | `bool` | `false` | Use persistent connection (`pconnect`) |
| `persistent_id` | `string` | `''` | Identifier for persistent connections |
| `password` | `string` | `null` | Authentication password (skipped when null or empty) |
| `database` | `int` | `null` | Database index to select after connecting |
| `unix_socket` | `string` | `null` | Unix socket path (overrides host/port) |

## RedisInterface

The core contract:

| Method | Description |
| ------ | ----------- |
| `get(string $key): mixed` | Get a value |
| `set(string $key, mixed $value, ?int $timeout = null): bool` | Set a value (with optional TTL in seconds) |
| `del(string\|array $keys): int` | Delete one or more keys |
| `exists(string $key): bool` | Check whether a key exists |
| `incr(string $key): int\|false` | Increment a value |
| `decr(string $key): int\|false` | Decrement a value |
| `keys(string $pattern): array` | Find keys matching a glob pattern |
| `client(): \Redis` | Access the underlying phpredis client |
| `getName(): ?string` | Connection name |
| `disconnect(): void` | Close the connection |
| `command(string $command, array $arguments = []): mixed` | Execute a raw Redis command |
| `__call(string $method, array $arguments): mixed` | Magic method proxy to phpredis |

## Redis connection wrapper

`Omega\Redis\Redis` wraps the phpredis extension and delegates all operations:

```php
use Omega\Redis\Redis;

$redis = new Redis([
    'host'     => '127.0.0.1',
    'port'     => 6379,
    'database' => 0,
]);

$redis->set('greeting', 'hello');
$redis->get('greeting');      // 'hello'
$redis->exists('greeting');   // true
$redis->del('greeting');      // 1

$redis->incr('counter');      // 1
$redis->decr('counter');      // 0
$redis->keys('counter*');     // ['counter']

$redis->set('temp', 'value', timeout: 300); // expires in 5 minutes

$redis->flushDb();            // flush current database
$redis->disconnect();         // close connection
```

### Hash operations (via magic method)

```php
$redis->hSet('user:1', 'name', 'Alice');    // int|false
$redis->hGet('user:1', 'name');              // 'Alice'
$redis->hLen('user:1');                      // 1
$redis->hDel('user:1', 'name');              // 1
```

### List operations (via magic method)

```php
$redis->lPush('tasks', 'task1');     // int|false
$redis->lPush('tasks', 'task2');     // int|false
$redis->lLen('tasks');               // 2
$redis->rPop('tasks');               // 'task1'
```

### Raw commands

```php
$redis->command('SET', ['key', 'value']);
$redis->set('key', 'value'); // equivalent
```

### Accessing the phpredis client directly

```php
$phpRedis = $redis->client();
$phpRedis->pipeline();
// ...
```

## RedisManager

Manages multiple named connections and resolves them lazily:

```php
use Omega\Redis\RedisManager;

$manager = new RedisManager();
$manager->setConfig($config);

$default = $manager->driver();              // uses default connection
$cache   = $manager->driver('cache');       // named driver
$conn    = $manager->connection('cache');   // same as driver()

$manager->setDefaultDriver($customConnection);
$manager->setDriver('custom', fn () => new Redis([...]));
$manager->getDriver();                      // default driver name
```

If a named driver is not registered, `connection()` falls back to building from
the configuration array. If no configuration exists for the connection, an
`Exception` is thrown.

The `RedisManager` implements `RedisInterface` and proxies all calls to the
active driver, so it can be used interchangeably with a `Redis` connection.

## Service provider

`RedisServiceProvider` binds `RedisManager` and `RedisInterface` in the
container:

```php
// The RedisManager is resolved lazily from the 'config' key:
$manager = $app->get(RedisManager::class);

// The default connection:
$redis = $app->get(RedisInterface::class);
```

Both bindings are lazy (closure-based), so the actual connection is only
established when first used.

## RedisConnector

Handles the low-level connection to the Redis server. Supports both TCP
(`connect`/`pconnect`) and Unix socket connections. Authentication and database
selection are performed after establishing the connection.

```php
use Omega\Redis\RedisConnector;

$connector = new RedisConnector();
$phpRedis  = $connector->connect([
    'host'     => '127.0.0.1',
    'port'     => 6379,
    'password' => 'secret',
    'database' => 2,
]);
```

Throws `\RuntimeException` when the `redis` PHP extension is not loaded.
Throws `\RedisException` when the connection fails.

## Extension requirement

The `redis` PHP extension must be installed and loaded. Check at runtime:

```php
use Omega\Redis\RedisManager;

RedisManager::isSupported(); // true if ext-redis is loaded
```

## Exceptions

| Exception | Namespace | Thrown when |
| --------- | --------- | ----------- |
| `\RuntimeException` | `\RuntimeException` | `redis` extension not loaded |
| `\RedisException` | `\RedisException` | Connection or command failure |
| `\Exception` | `\Exception` | Unknown driver or connection name in `RedisManager` |

## Notes

- The `redis` PHP extension is required; there is no fallback driver.
- `Redis::__call()` proxies any method call to the underlying phpredis client,
  so all phpredis methods (`hSet`, `lPush`, `sAdd`, `expire`, `ttl`, etc.)
  are available without explicit wrappers.
- `Redis::set()` with a `$timeout` uses `setex()` internally; without a timeout
  it uses `set()`.
- Persistent connections (`persistent: true`) use `pconnect()` and are shared
  across requests within the same process.

## Reference

- `RedisInterface.php`, `Redis.php`, `RedisManager.php`
- `RedisConnector.php`, `RedisServiceProvider.php`
- Tests: `tests/Unit/Redis/`
- License: GPL-3.0+
