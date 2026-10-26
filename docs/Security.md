# Omega MVC — Security Package Manual

The `Omega\Security` package covers password hashing (a `HashManager` with
multiple **drivers**) and symmetric encryption (`Crypt`, plus `encrypt()` /
`decrypt()` helpers). Hashing is a thin wrapper over PHP's native `password_*`
functions; encryption wraps OpenSSL. It depends on `Omega\Container` and
`Omega\Config` for wiring.

## Hashing — `HashManager`

`HashManager implements HashInterface`. It holds a default driver plus any number
of named drivers and delegates every operation to the resolved one.

```php
use Omega\Security\Hashing\BcryptHasher;
use Omega\Security\Hashing\Argon2IdHasher;
use Omega\Security\Hashing\HashInterface;
use Omega\Security\Hashing\HashManager;

$manager = new HashManager();                // default driver = DefaultHasher (bcrypt)
$manager->setDefaultDriver(new BcryptHasher());
$manager->setDriver('argon2id', new Argon2IdHasher());

$manager->driver();                // default driver
$manager->driver('argon2id');      // named driver
$hash = $manager->make('secret');  // $2y$12$...
$manager->verify('secret', $hash); // true
```

- `setDefaultDriver(HashInterface $driver): self`
- `setDriver(string $driverName, HashInterface $driver): self`
- `driver(?string $driver = null): HashInterface` — returns the named driver when
  registered, otherwise the default driver.
- `info(string $hash): array` — `password_get_info()` result
  (`['algo', 'algoName', 'options']`).
- `make(string $value, array $options = []): string`
- `verify(string $value, string $hashedValue, array $options = []): bool`
- `isValidAlgorithm(string $hash): bool`

### Built-in hashers

| Driver class | Algorithm | Defaults | Options |
| ------------ | --------- | -------- | ------- |
| `DefaultHasher` | `PASSWORD_DEFAULT` | — | none |
| `BcryptHasher` | `PASSWORD_BCRYPT` | `rounds = 12` | `rounds`; `setRounds()` |
| `ArgonHasher` | `PASSWORD_ARGON2I` | `memory 1024`, `time 2`, `threads 2` | `memory`/`time`/`threads`; `setMemory()`/`setTime()`/`setThreads()` |
| `Argon2IdHasher` | `PASSWORD_ARGON2ID` | inherits Argon2i defaults | same as `ArgonHasher` |

All four extend `DefaultHasher` (plain `password_hash` + `password_verify`).
`isValidAlgorithm()` compares `info($hash)['algoName']` against `bcrypt`,
`argon2i`, or `argon2id` respectively.

```php
$bcrypt = new BcryptHasher();
$bcrypt->setRounds(15);

$argon = new Argon2IdHasher();
$argon->setMemory(2048)->setTime(4)->setThreads(2);

$hash = $argon->make('s3cret', ['memory' => 4096]);   // per-call override
```

## The `HashInterface` contract

```php
interface HashInterface
{
    public function info(string $hash): array;
    public function verify(string $value, string $hashedValue, array $options = []): bool;
    public function make(string $value, array $options = []): string;
    public function isValidAlgorithm(string $hash): bool;
}
```

There is **no** `needsRehash()` — deciding to upgrade a hash is left to the
application (tip: compare under the `PasswordHash` facade/config you prefer, or
re-hash when `info($hash)['algoName'] !== 'argon2id'`). `make()` documents
`Argon2IdHashingNotSupportedException` for builds without Argon2id support.

## Service provider — `HashServiceProvider`

Binds the drivers and the manager into the container:

- `hash.bcrypt` — `BcryptHasher`; rounds come from `BCRYPT_ROUNDS` config key
  (default `12`, falls back to `12` when not an int).
- `hash.argon` — `ArgonHasher` with `memory 1024 / time 2 / threads 2`.
- `hash.argon2id` — `Argon2IdHasher`.
- `hash.default` — `DefaultHasher`.
- `hash` — a `HashManager` whose default **driver is bcrypt**, registering
  `bcrypt`, `argon`, `argon2id` and `default` as named drivers.

```php
// config or .env
BCRYPT_ROUNDS=12
```

## Hashing via the container / facade

```php
/** @var HashManager $hash */
$hash = $app->make('hash');
$hash->verify($input, $stored);
$hash->driver('argon2id')->make($input);
```

`Facade\Hash` resolves `HashManager::class` and forwards statically:

```php
use Omega\Security\Facade\Hash;

Hash::make('secret', ['rounds' => 12]);
Hash::verify('secret', $hash);
Hash::info($hash);
Hash::isValidAlgorithm($hash);
Hash::setDriver('argon2id', new Argon2IdHasher());
Hash::driver('argon2id');
```

## Symmetric encryption — `Crypt`

`Crypt` encrypts/decrypts with OpenSSL. Pass phrases are normalized to a 32-byte
SHA-256 key; a secure random IV is generated per instance.

```php
use Omega\Security\Algo;
use Omega\Security\Crypt;

$crypt = new Crypt('secret-pass-phrase', Algo::AES_256_CBC);

$encrypted = $crypt->encrypt('top secret');     // base64 string
$plain     = $crypt->decrypt($encrypted);       // 'top secret'

// per-call pass phrase override:
$other = $crypt->encrypt('data', 'another-pass');
```

- Cipher definition format: `"ALGO_NAME;IV_LENGTH"` (see `Algo::AES_256_CBC`).
- `hash(string $passPhrase): string` — raw SHA-256 digest.
- `encrypt(string $plainText, ?string $passPhrase = null): string`
- `decrypt(string $encrypted, ?string $passPhrase = null): string`

### Helpers

```php
use function Omega\Security\encrypt;
use function Omega\Security\decrypt;

$encrypted = encrypt('payload', 'pass-phrase');          // algo default: Algo::AES_256_CBC
$plain     = decrypt($encrypted, 'pass-phrase');
```

Both require a pass phrase and throw `RuntimeException` otherwise. Note these
helpers live in `src/Omega/Security/helper.php`, which is **not** on Composer's
`files` autoload list — pull them in explicitly if you want them.

## Exceptions

All in `Omega\Security\Exceptions`; every exception implements
`SecurityExceptionInterface` (a `Throwable` marker for catching security errors
in one type hint).

| Exception | Extends | When thrown |
| --------- | ------- | ----------- |
| `InvalidCipherDefinitionException` | `RuntimeException` | malformed cipher definition (missing/no positive IV length); OpenSSL encrypt/decrypt failure |
| `Argon2IdHashingNotSupportedException` | `RuntimeException` | Argon2id unavailable on the current PHP build (documented on `HashInterface::make()`) |

## Notes

- Hashing is deterministic-free and self-contained: `make()` uses only the value
  and the driver options, no per-request salt configuration needed.
- The `Hash` facade's container accessor is the `HashManager::class` string;
  the provider's `hash` binding is a named binding — resolve through `make('hash')`
  when you need the fully wired manager with the bcrypt default.

## Reference

- `Hashing/HashManager.php`, `Hashing/HashInterface.php`
- `Hashing/DefaultHasher.php`, `Hashing/BcryptHasher.php`, `Hashing/ArgonHasher.php`,
  `Hashing/Argon2IdHasher.php`
- `HashServiceProvider.php`, `Algo.php`, `Crypt.php`, `helper.php`
- `Facade/Hash.php`
- `Exceptions/` (`SecurityExceptionInterface`, `InvalidCipherDefinitionException`,
  `Argon2IdHashingNotSupportedException`)
- Tests: `tests/Unit/Security/`
- License: GPL-3.0+