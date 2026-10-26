# Omega MVC — RateLimiter Package Manual

The `Omega\RateLimiter` package provides a cache-backed rate limiting system.
It defines a `RateLimiterInterface` contract, a `RateLimiterFactory` for
creating limiter instances, and pluggable policies (`FixedWindow`, `NoLimiter`).
The `ThrottleMiddleware` in the `Omega\Middleware` package consumes this
interface to enforce per-route rate limits.

## RateLimiterInterface

The core contract for all rate limiters:

| Method | Description |
| ------ | ----------- |
| `isBlocked(string $key, int $maxAttempts, int\|DateInterval $decay): bool` | Whether the key has exceeded the limit |
| `consume(string $key, int $decayMinutes = 1): int` | Consume an attempt; returns the count consumed so far |
| `getCount(string $key): int` | Current number of consumed attempts |
| `getRetryAfter(string $key): int` | Seconds until the key can retry (0 if not blocked) |
| `remaining(string $key, int $maxAttempts): int` | Remaining attempts before blocking |
| `reset(string $key): void` | Clear all attempts for the key |

## RateLimiterFactory

A `readonly` factory that creates limiter instances from a cache backend:

```php
use Omega\Cache\CacheManager;
use Omega\RateLimiter\RateLimiterFactory;

$factory = new RateLimiterFactory($cache);

// Fixed window: 60 attempts per 60 seconds
$limiter = $factory->createFixedWindow(limit: 60, windowSeconds: 60);

// No-op limiter: never blocks
$limiter = $factory->createNoLimiter();
```

Both methods return a `RateLimiterInterface`.

## RateLimiter (implementation)

A `readonly` class that wraps a `PolicyInterface` and delegates to it:

```php
use Omega\RateLimiter\RateLimiter;

$limiter = new RateLimiter($fixedWindowPolicy);

$limiter->isBlocked('user:42', 60, 1);   // bool
$limiter->consume('user:42', 1);          // int (consumed count)
$limiter->getCount('user:42');             // int
$limiter->getRetryAfter('user:42');        // int (seconds)
$limiter->remaining('user:42', 60);        // int
$limiter->reset('user:42');                // void
```

## RateLimit value object

Returned by policies. Encapsulates the state for a single key:

| Method | Description |
| ------ | ----------- |
| `getIdentifier(): string` | The key (e.g. IP hash, user ID) |
| `getLimit(): int` | Maximum allowed attempts |
| `getConsumed(): int` | Attempts already consumed |
| `getRemaining(): int` | Remaining attempts |
| `isBlocked(): bool` | Whether the key is currently blocked |
| `getRetryAfter(): ?DateTime` | When the key can retry (null if not blocked) |
| `getExpiresAt(): ?DateTime` | When the rate limit expires (null if not set) |

## Policies

### FixedWindow

Enforces a maximum number of attempts within a fixed time window. Uses the
cache to store counters keyed by `{key}:fw:{windowStart}`.

```php
use Omega\RateLimiter\Policy\FixedWindow;

$policy = new FixedWindow(cache: $cache, limit: 100, windowSeconds: 60);

$rateLimit = $policy->consume('user:42');
if ($rateLimit->isBlocked()) {
    // too many requests
}

$policy->peek('user:42');   // read-only check, no consumption
$policy->reset('user:42');  // clear the counter
```

### NoLimiter

A no-op policy that never blocks. Useful for development or testing:

```php
use Omega\RateLimiter\Policy\NoLimiter;

$policy = new NoLimiter();
$rateLimit = $policy->consume('user:42');
$rateLimit->getRemaining(); // PHP_INT_MAX
```

## ThrottleMiddleware (route-level)

The `Omega\Middleware\ThrottleMiddleware` consumes a `RateLimiterInterface`
to enforce limits on incoming requests. When a client exceeds the limit, the
middleware returns an HTTP 429 response with `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, and `Retry-After` headers.

```php
use Omega\Router\Router;
use Omega\Middleware\ThrottleMiddleware;

Router::post('/login', 'LoginController@store')
    ->middleware([ThrottleMiddleware::class]);
```

Apply to a controller class with the `#[Middleware]` attribute:

```php
use Omega\Router\Attribute\Middleware;

#[Middleware([ThrottleMiddleware::class])]
final class LoginController { /* ... */ }
```

## RateLimiterServiceProvider

Registers the rate limiter infrastructure in the application container:

- Binds `RateLimiterFactory` with the application cache.
- Binds `ThrottleMiddleware` with a fixed-window limiter (60 requests per 60
  seconds).

```php
// Resolved automatically when the service provider is registered:
$factory  = $app->get(RateLimiterFactory::class);
$throttle = $app->get(ThrottleMiddleware::class);
```

## Usage with route attributes

```php
use Omega\Router\Attribute\Middleware;
use Omega\Middleware\ThrottleMiddleware;

#[Middleware([ThrottleMiddleware::class])]
final class ApiController
{
    public function index(): string { /* ... */ }
}
```

Or per-method:

```php
#[Middleware([ThrottleMiddleware::class])]
public function store(): string { /* ... */ }
```

## Exceptions

| Exception | Namespace | Thrown when |
| --------- | --------- | ----------- |
| `DateInvalidTimeZoneException` | `DateInvalidTimeZoneException` | Invalid timezone in date operations |
| `DateMalformedStringException` | `DateMalformedStringException` | Malformed date string in retry-after calculation |

## Notes

- Rate limiting is backed by the cache layer (`Omega\Cache\CacheInterface`);
  ensure a working cache driver is configured.
- The `FixedWindow` policy computes window keys using integer division of the
  current timestamp by the window duration, so counters reset automatically.
- `ThrottleMiddleware` hashes the client IP with `sha1()` before using it as
  the rate limit key for privacy.
- The `NoLimiter` policy is useful for testing or for routes that should bypass
  rate limiting.

## Reference

- `RateLimiterInterface.php`, `RateLimiter.php`, `RateLimit.php`
- `RateLimiterFactory.php`, `RateLimiterServiceProvider.php`
- `Policy/PolicyInterface.php`, `Policy/FixedWindow.php`, `Policy/NoLimiter.php`
- Related: `Omega\Middleware\ThrottleMiddleware`
- Tests: `tests/Unit/RateLimiter/`
- License: GPL-3.0+
