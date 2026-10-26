# Omega MVC — Archive Package Manual

The `Omega\Archive` package provides a common interface for working with BZ2, ZIP and
PHAR archive files. All adapters implement the same contract (`AdapterInterface`), so
swapping the underlying format does not change your calling code.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

You only need the `archive` PHP extension capabilities that PHP ships with by default
(`bzip2`, `zip`, and `phar`). PHAR write operations with the default engine require
`phar.readonly=0` in `php.ini`; the engine is injectable, and `NativePharEngine` also
accepts a `PharData` instance, which stays writable even with `phar.readonly=1`.

## Included adapters

| Adapter                 | Format | Engine       | Write support                        |
| ----------------------- | ------ | ------------ | ------------------------------------ |
| `Omega\Archive\Bz2Adapter` | single BZ2 file | `bzip2`       | Yes (rewrites the whole file)        |
| `Omega\Archive\ZipAdapter` | ZIP archive | `ZipArchive`  | Yes (adds members to an open archive)|
| `Omega\Archive\PharAdapter`| PHAR archive | `Phar`        | Yes (only with `phar.readonly=0`)    |

## The common interface

Every adapter implements `Omega\Archive\AdapterInterface` and shares this surface:

| Method                                     | Description |
| ------------------------------------------ | ----------- |
| `open(string $file): void`                 | Switch the underlying file target. |
| `close(): void`                            | Release the handle. |
| `read(string $key): string\|bool`          | Read a member's content; `false` when the data is corrupted/empty. |
| `write(string $key, string $content): int\|bool` | Write a member; returns the number of written bytes. |
| `delete(string $key): bool`                | Remove a member. |
| `exists(string $key): bool`                | Check whether a member exists. |
| `keys(): array`                            | List the member names. |
| `isDirectory(string $key): bool`           | Whether a member is a directory. |
| `mtime(string $key): int\|bool`            | Modification time of the archive (or a member) as a Unix timestamp. |
| `rename(string $sourceKey, string $targetKey): bool` | Rename a member. |

All adapters throw `RuntimeException` on unsupported operations or failure conditions.

## Bz2Adapter

A BZ2 file is compressed as a whole, so membership is simulated with a single empty
key. `read()` and `write()` are normally called with `''` as the key.

```php
use Omega\Archive\Bz2Adapter;

$adapter = new Bz2Adapter(storage_path('logs/backup.bz2'));
$adapter->open(storage_path('logs/archive.bz2'));

$adapter->write('', $compressedPayload);
$content = $adapter->read('');

$adapter->rename(storage_path('logs/archive.bz2'), storage_path('logs/old.bz2'));
$adapter->close();
```

Behavior notes:

- `keys()`, `isDirectory()` and `delete()` are not meaningful for a flat BZ2 file:
  `keys()` returns `[]`, `isDirectory()` returns `false`, `delete()` returns `false`.
- `exists()` only reports whether the underlying file is present.
- `mtime()` returns the file's modification time; it throws when the file cannot be
  stat-ed.
- `read()` returns `false` instead of throwing when the decompressed content is
  invalid; check the return value before treating it as content.
- `write()` compresses the content and replaces the whole file, so it is best suited
  to single-document payloads rather than frequent incremental updates.
- `rename()` validates that the source exists/is readable and that the target does not
  already exist before renaming.

## ZipAdapter

```php
use Omega\Archive\ZipAdapter;

// Opens the archive, creating it if it does not exist yet.
$archive = new ZipAdapter(storage_path('uploads/archive.zip'));

$archive->write('docs/readme.txt', 'Hello, world!');
$archive->write('config/app.json', json_encode($config));

foreach ($archive->keys() as $key) {
    echo $key . ' -> ' . ($archive->exists($key) ? 'present' : 'missing') . PHP_EOL;
}

$content = $archive->read('docs/readme.txt');   // string, or exception on missing key
$archive->isDirectory('docs/');                 // true

$archive->rename('docs/readme.txt', 'docs/README.txt');
$archive->delete('config/app.json');

$archive->close();
```

Behavior notes:

- `write()` adds or replaces a member (duplicate keys are overwritten) and returns the
  stored byte count.
- `read()` throws when the key does not exist; `mtime()` returns `false` for missing
  members.
- `rename()` throws if the source is missing or the target already exists.
- `keys()` lists member names; empty names and directory entries are represented with
  trailing slashes (e.g. `docs/`).
- The archive is closed automatically when the adapter is destroyed.

## PharAdapter

```php
use Omega\Archive\PharAdapter;

$archive = new PharAdapter(storage_path('app/cache.phar'));

if (Phar::canWrite()) {
    $archive->write('config.json', json_encode($config));
}

// With an injectable engine (e.g. writable even when phar.readonly=1):
$engine  = new NativePharEngine(new PharData(storage_path('app/data.phar')));
$archive = new PharAdapter(storage_path('app/data.phar'), $engine);
$archive->write('config.json', json_encode($config));

$content = $archive->read('config.json');
$keys    = $archive->keys();        // phar://-style stream identifiers
$archive->isDirectory('subdir');    // true when the member is a directory

$archive->rename('config.json', 'config.backup.json');
$archive->delete('config.backup.json');
```

Behavior notes:

- The constructor and `open()` require the file to exist; `open()` re-throws a
  meaningful error when the target is not a valid PHAR archive.
- Write/delete/rename operations throw unless PHAR is writable
  (`phar.readonly=0`). Use `Phar::canWrite()` to guard them — or inject a
  `NativePharEngine` backed by a `PharData`, whose writes keep working with
  `phar.readonly=1`.
- `read()`, `write()`, `delete()` and `mtime()` throw when the key does not exist.
- `keys()` returns key names usable with `read()`; internally they map to
  `phar://` stream paths.
- `rename()` cannot copy the body of a directory member; renaming a directory throws a
  `RuntimeException`.
- PHAR keeps its members in memory, so the archive stays readable after the
  underlying file is deleted.

## Using the interface for dependency injection

Type against the interface so your code stays format-agnostic:

```php
use Omega\Archive\AdapterInterface;

class BackupService
{
    public function __construct(
        private readonly AdapterInterface $archive
    ) {
    }

    public function store(string $payload): void
    {
        $this->archive->write('', $payload);
    }
}
```

## Reference

- Interface: `src/Omega/Archive/AdapterInterface.php`
- Adapters: `Bz2Adapter.php`, `ZipAdapter.php`, `PharAdapter.php`
- Engines: `PharEngineInterface.php`, `NativePharEngine.php`
- License: GPL-3.0+