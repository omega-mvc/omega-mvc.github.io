# Omega MVC — Cache Package Manual

The `Omega\Cache` package provides a PSR-16 compatible caching layer with a
multi-driver `CacheManager`, a base `AbstractCache` class, five storage backends
(memory, file, APCu, Memcached, Redis), and a service provider that wires
everything from application configuration. The `Cache` facade exposes the manager
through the `'cache'` container binding.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

The available drivers are: `memory`, `file`, `apcu`, `memcached`, and `redis`.
APCu, Memcached, and Redis require their respective PHP extensions. The default
driver and per-driver options are configured in `config/cache.php`.

## CacheInterface

`Omega\Cache\CacheInterface` extends `Psr\SimpleCache\CacheInterface` (PSR-16) and
adds three convenience methods:

| Method | Description |
| ------ | ----------- |
| `increment(string $key, int $value): int` | Increment a numeric cache value; missing keys initialize at 0. |
| `decrement(string $key, int $value): int` | Decrement a numeric cache value; delegates to `increment`. |
| `remember(string $key, Closure $callback, int\|DateInterval\|null $ttl): mixed` | Return the cached value or execute the callback, cache, and return it. |

Standard PSR-16 methods (`get`, `set`, `delete`, `clear`, `has`, `getMultiple`,
`setMultiple`, `deleteMultiple`) are inherited from the PSR contract.

## CacheManager

`CacheManager` implements `CacheInterface` and acts as a central registry for
named cache drivers. All calls forwarded via `__call` (and the explicit
`CacheInterface` methods) delegate to the default driver.

```php
use Omega\Cache\CacheManager;
use Omega\Cache\Storage\MemoryStorage;

$manager = new CacheManager('memory', new MemoryStorage(['ttl' => 60]));
$manager->setDriver('file', fn (): CacheInterface => new FileStorage($options));

$manager->get('key');                       // default driver
$manager->getDriver('file')->get('key');    // named driver
$manager->getDriverNames();                 // ['memory', 'file']
$manager->getDefaultDriverName();           // 'memory'
```

### API

| Method | Description |
| ------ | ----------- |
| `__construct(string $defaultDriverName, CacheInterface $defaultDriver)` | Register the default driver. |
| `setDefaultDriver(CacheInterface $driver): self` | Replace the default driver (chainable). |
| `setDriver(string $name, CacheInterface\|Closure $driver): self` | Register a named driver; closures are resolved lazily and cached. |
| `getDriver(?string $driverName = null): CacheInterface` | Resolve a named driver or return the default. Throws `UnknownStorageException` for unknown names. |
| `getDefaultDriverName(): string` | Return the default driver name. |
| `getDriverNames(): list<string>` | Return all registered driver names. |

All `CacheInterface` methods delegate to `getDriver()`.

## Storage drivers

All drivers extend `AbstractCache` and implement both `CacheInterface` and
`StorageInterface`. They accept an `$options` array in the constructor.

### MemoryStorage

In-memory, ephemeral cache backed by a PHP array. Entries are automatically
expired on read and garbage-collected on write. A `maxItems` cap (default 1024)
evicts the least-recently-written entry when reached.

```php
use Omega\Cache\Storage\MemoryStorage;

$cache = new MemoryStorage(['ttl' => 300, 'maxItems' => 512]);
```

Always supported (`isSupported()` returns `true`).

### FileStorage

Persistent file-based cache. Keys are SHA-1 hashed into a two-level directory
tree to avoid filesystem overload. Each entry is serialized with its value,
expiration timestamp, and modification time.

```php
use Omega\Cache\Storage\FileStorage;

$cache = new FileStorage(['ttl' => 3600, 'path' => storage_path('cache')]);
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| `path` | Yes | Directory for cache files; created automatically. |
| `ttl` | No | Default TTL in seconds (default 3600). |

Throws `CacheConfigurationException` if `path` is missing, `CachePathException` if
the directory cannot be created. Always supported.

### ApcuStorage

APCu-backed cache. Requires the `apcu` PHP extension.

```php
use Omega\Cache\Storage\ApcuStorage;

$cache = new ApcuStorage(['ttl' => 600, 'prefix' => 'myapp_']);
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| `prefix` | Yes | Key prefix; throws `CacheConfigurationException` if empty. |
| `ttl` | No | Default TTL in seconds (default 3600). |

`isSupported()` returns `true` only when the `apcu` extension is loaded and enabled.

### MemcachedStorage

Memcached-backed cache. Requires the `memcached` PHP extension.

```php
use Omega\Cache\Storage\MemcachedStorage;

$cache = new MemcachedStorage([
    'ttl'      => 600,
    'prefix'   => 'myapp_',
    'servers'  => [['host' => '127.0.0.1', 'port' => 11211]],
    'username' => 'user',
    'password' => 'secret',
    'timeout'  => 3,
]);
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| `servers` | No | Array of `['host' => string, 'port' => int]`; defaults to `127.0.0.1:11211`. |
| `host` | No | Single-server shorthand. |
| `port` | No | Single-server port. |
| `prefix` | No | Key prefix (default `''`). |
| `username` | No | SASL auth username. |
| `password` | No | SASL auth password. |
| `timeout` | No | Connection timeout in seconds. |
| `ttl` | No | Default TTL (default 3600). |

`isSupported()` pings `127.0.0.1:11211` to verify availability.

### RedisStorage

Redis-backed cache. Requires the `redis` PHP extension and an `Omega\Redis\RedisInterface`
connection.

```php
use Omega\Cache\Storage\RedisStorage;

$cache = new RedisStorage(['ttl' => 600, 'connection' => 'default'], $redisConnection);
```

| Option | Required | Description |
| ------ | -------- | ----------- |
| `connection` | No | Redis connection name; falls back to `config('redis.default')`. |
| `ttl` | No | Default TTL (default 3600). |

`clear()` issues a `FLUSHDB` command. `isSupported()` attempts a local connection
to `127.0.0.1:6379`.

## AbstractCache

Base class providing shared implementations:

- `getMultiple()` — loops over keys calling `get()`
- `deleteMultiple()` — loops over keys calling `delete()`
- `decrement()` — delegates to `increment()` with a negated value
- `remember()` — returns cached value or executes callback, caches, and returns

The constructor accepts `int|DateInterval $defaultTTL`; negative integer TTLs
throw `CacheConfigurationException`.

## CacheTimeTrait

Used by `FileStorage` and `MemoryStorage`. Provides `createMtime(): float` which
returns a millisecond-precision timestamp for cache entry metadata.

## StorageInterface

Additional contract beyond PSR-16 that every storage driver implements:

| Method | Description |
| ------ | ----------- |
| `getInfo(string $key): array` | Return `[value, timestamp, mtime]` metadata or `[]` for missing keys. |
| `calculateExpirationTimestamp(int\|DateInterval\|DateTimeInterface\|null $ttl): int` | Convert a TTL into a Unix expiration timestamp. |
| `static isSupported(): bool` | Whether the backend extension/connection is available. |

## CacheServiceProvider

Reads `config('cache')` and registers:

- `'cache.<name>'` — lazy binding for each configured driver.
- `'cache'` — a `CacheManager` instance with the default driver and all others
  registered via lazy closures.

Redis drivers are resolved through `RedisManager` from the container.

## Facade

```php
use Omega\Cache\Facade\Cache;

Cache::get('key');
Cache::set('key', 'value', 600);
Cache::remember('key', fn () => expensive(), 3600);
Cache::increment('counter', 1);
Cache::getDriver('redis')->get('key');
```

The `Cache` facade resolves the `'cache'` container binding (a `CacheManager`).

## Exceptions

All under `Omega\Cache\Exceptions`:

| Exception | When thrown |
| --------- | ----------- |
| `UnknownStorageException` | `CacheManager::getDriver()` with an unregistered driver name |
| `CacheConfigurationException` | Missing or invalid constructor options (e.g. empty `path`, empty `prefix`, negative TTL) |
| `CachePathException` | `FileStorage` cannot create or write to the cache directory |
| `InvalidValueIncrementException` | `FileStorage::increment()` on a non-integer value |

`InvalidValueIncrementException` implements
`Psr\SimpleCache\InvalidArgumentException`. `UnknownStorageException` and
`CachePathException` implement `Psr\SimpleCache\CacheException`.

## Reference

- `CacheInterface.php`, `CacheManager.php`, `AbstractCache.php`
- `Storage/StorageInterface.php`, `Storage/MemoryStorage.php`, `Storage/FileStorage.php`,
  `Storage/ApcuStorage.php`, `Storage/MemcachedStorage.php`, `Storage/RedisStorage.php`
- `Traits/CacheTimeTrait.php`
- `CacheServiceProvider.php`
- `Facade/Cache.php` (accessor `'cache'`)
- `Exceptions/`
- Tests: `tests/Unit/Cache/`
- License: GPL-3.0+
