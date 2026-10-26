# Omega MVC — Filesystem Package Manual

The `Omega\Filesystem` package provides a clean abstraction over file storage
backends. The central `Filesystem` class wraps an adapter (`Local`, `SFTP`, `FTP`,
Amazon S3 / AsyncAws S3, in-memory) behind the `FilesystemInterface` contract, with
`get()/write()/read()/delete()` plus metadata (mtime, checksum, size, MIME type) and
stream support. A `FilesystemMap` manages multiple named filesystems, and a PHP
stream wrapper exposes them as `omega://` URLs usable with `file_get_contents()`.

The package has **no global helpers** and **no facade**. Uses: `Omega\Container`,
PHP `ext`, optional `phpseclib/phpseclib` (SFTP), `aws/aws-sdk-php` or
`async-aws/simple-s3` (S3), `ext-ftp` (FTP). It never reads config: build adapters
and the `Filesystem` class directly.

## Getting a filesystem

There is no working container binding out of the box (see Notes). The
**blessed manual setup** is to build an adapter and wrap it:

```php
use Omega\Filesystem\Filesystem;
use Omega\Filesystem\Adapter\Local\Local;

$filesystem = new Filesystem(
    new Local(__DIR__ . '/storage', create: true, mode: 0777)
);
```

For a config-driven multi-driver setup, use `FilesystemMap`:

```php
use Omega\Filesystem\Filesystem;
use Omega\Filesystem\FilesystemMap;
use Omega\Filesystem\Adapter\Local\Local;

$map = new FilesystemMap();
$map->set('local', new Filesystem(new Local('/var/www/storage')));
$map->set('backups', new Filesystem(new Local('/var/backups')));

$filesystem = $map->get('local');   // InvalidArgumentException if missing
$map->has('local');                 // true
$map->all();                        // array name => Filesystem
$map->remove('backups');
$map->clear();
```

`FilesystemMap::set()` requires names matching `/^[-_a-zA-Z0-9]+$/` and throws
`InvalidArgumentException` otherwise.

## Filesystem API

```php
$fs->has('uploads/photo.jpg');              // bool
$fs->read('config/app.php');                // string (throws RuntimeException if unreadable)
$fs->write('logs/run.log', "line\n");       // int bytes (throws if exists & !$overwrite)
$fs->write('logs/run.log', "line\n", true); // overwrite allowed
$fs->rename('tmp/a.txt', 'final/a.txt');    // bool (target must NOT exist)
$fs->delete('tmp/a.txt');                   // bool
$fs->keys();                                // string[] all keys
$fs->listKeys('uploads/');                  // ['keys' => [...], 'dirs' => [...]] or adapter-specific
$fs->mtime('a.txt');                        // int unix timestamp
$fs->checksum('a.txt');                     // string MD5
$fs->size('a.txt');                         // int bytes
$fs->mimeType('a.txt');                     // string (adapter must provide it)
$fs->isDirectory('uploads');                // bool
```

Key-manipulating public methods validate the key (empty keys throw
`InvalidArgumentException`, message `Object path is empty.`), while `keys()`,
`listKeys()` and `isDirectory()` delegate straight to the adapter without
validation. Operations that expect an existing file throw `FileNotFoundException`.

`get(string $key, bool $create = false)` and `createFile(string $key)` return a
cached `File` object (the `Filesystem` keeps a per-instance register); call
`clearFileRegister()` to drop it.

```php
$file = $fs->get('uploads/doc.txt');
$file->getKey();             // string
$file->getName();            // human-readable name (defaults to key)
$file->getContent();         // lazy-loaded, cached on first access
$file->setContent($string);  // int bytes (always overwrite); updates size
$file->getSize();            // int (via adapter, or Size::fromContent)
$file->getMtime();           // int
$file->setName('Renamed');   // display name only
$file->exists();             // bool
$file->delete();             // bool
$file->rename('new/key.txt');// void (also updates the internal key)
$file->createStream();       // StreamInterface
```

## Streams

A `StreamInterface` (`open/read/write/close/flush/seek/tell/eof/stat/cast/unlink`)
backs the stream wrapper. `StreamMode` parses `fopen()` mode strings:

```php
use Omega\Filesystem\Stream\StreamMode;

$mode = new StreamMode('r+');
$mode->allowsRead();                     // true  ('r' or '+')
$mode->allowsWrite();                    // true  ('+' or not 'r')
$mode->allowsExistingFileOpening();      // mode does not start with 'x'
$mode->allowsNewFileOpening();           // mode does not start with 'r'
$mode->impliesExistingContentDeletion(); // mode starts with 'w'
$mode->isBinary();                       // flag 'b'
```

### Adapter-native streams

When the adapter implements `StreamFactoryInterface` (only `Local`), streams are
real file streams:

```php
$fs = new Filesystem(new Local('/var/www/storage'));
$stream = $fs->createStream('uploads/photo.jpg');
$stream->open(new StreamMode('r'));
$bytes = $stream->read(256);
$stream->close();
```

### In-memory fallback

For adapters without stream support, `createStream()` returns an `InMemoryBuffer`
that buffers in memory and writes back to the filesystem on `flush()`/`close()`.

### The `omega://` stream wrapper

Register named filesystems in a map, then use standard PHP stream functions:

```php
use Omega\Filesystem\FilesystemMap;
use Omega\Filesystem\Stream\StreamWrapper;

$map = new FilesystemMap();
$map->set('local', $localFilesystem);
$map->set('backups', $backupFilesystem);

StreamWrapper::setFilesystemMap($map);
StreamWrapper::register('omega');          // optional scheme, default 'omega'
StreamWrapper::getFilesystemMap();

$css = file_get_contents('omega://local/assets/app.css');
file_put_contents('omega://backups/db.sql', $dump);
$h = fopen('omega://local/logs/app.log', 'a+');
fwrite($h, "line\n");
fclose($h);
```

URL format: `omega://{filesystem-name}/{key}` — the host is looked up in the map.
Invalid URLs throw `InvalidArgumentException('The specified path (%s) is invalid.')`.
`register()` throws `RuntimeException` if the wrapper cannot be registered.

## Adapters

| Adapter | Requires | Constructor |
| ------- | -------- | ----------- |
| `Adapter\Local\Local` | — | `(string $directory, bool $create = false, int $mode = 0777)` |
| `Adapter\Sftp\Sftp` | `phpseclib/phpseclib` | `(SecLibSFTP $sftp, ?string $directory = null, bool $create = false)` |
| `Adapter\Ftp\Ftp` | `ext-ftp` | `(array $config)` — `host`/`username`/`password`/`port`(21)/`passive`/`create`/`mode`/`ssl`/`timeout`(90)/`utf8`/`directory` |
| `Adapter\Amazon\AwsS3` | `aws/aws-sdk-php` | `(array $config)` — `bucket`+`key`+`secret` (+`region` default `us-west-2`, `token`, `detectContentType`, `create`, `directory`, `acl`, `options`) |
| `Adapter\Amazon\AsyncAwsS3` | `async-aws/simple-s3` | same as `AwsS3` |
| `Adapter\Memory\InMemory` | — | `(array $files = [])` — value `string` or `['content'=>..,'mtime'=>int]`; `setFiles()`/`setFile()` |

Capability matrix (adapter provides native support; `Filesystem` falls back
otherwise):

| Adapter | Stream | Checksum | Size | MIME | Metadata | ListKeys | FileFactory |
| ------- | :----: | :------: | :--: | :--: | :------: | :------: | :---------: |
| Local | yes | yes | yes | yes | no | no | no |
| Sftp | no | no | no | no | no | yes | yes |
| Ftp | no | no | yes | no | no | yes | yes |
| AwsS3 | no | no | yes | yes | yes | yes | no |
| AsyncAwsS3 | no | no | yes | yes | yes | yes | no |
| InMemory | no | no | no | yes | no | no | no |

Fallbacks when an adapter lacks a capability: stream → `InMemoryBuffer`;
checksum → MD5 of `read()`; size → byte length of `read()`; MIME type → throws
`LogicException('Adapter "%s" cannot provide MIME type')`; listKeys → filters
`keys()` by prefix into `['keys'=>[], 'dirs'=>[]]`.

The **Local** adapter guards against path traversal: keys resolving outside the
base directory throw `OutOfBoundsException('The path "%s" is out of the filesystem.')`.
It auto-creates parent directories on write/rename. `computeKey(string $absolutePath)`
returns the relative key for an absolute path.

## Utility classes

- `Util\Path` (static): `normalize($path)` (backslash → slash, resolves `.`/`..`),
  `isAbsolute($path)`, `getAbsolutePrefix($path)`, `dirname($path)`.
- `Util\Checksum` (static): `fromContent($content): string` (md5),
  `fromFile($filename): string` (md5_file; `RuntimeException` if unreadable).
- `Util\Size` (static): `fromContent($content): int` (mb byte count),
  `fromFile($filename): int` (`InvalidArgumentException` if missing),
  `fromResource($handle)` (fstat size).

## Contracts

Optional capability interfaces in `Omega\Filesystem\Contracts` that adapters may
implement, detected via `instanceof`:

`StreamFactoryInterface`, `MetadataSupporterInterface` (`setMetadata`/`getMetadata`;
S3 remaps `contentType` → `ContentType`), `SizeCalculatorInterface`, `ListKeysAwareInterface`,
`FileFactoryInterface`, `MimeTypeProviderInterface` (returns `string|false`),
`ChecksumCalculatorInterface`.

## AppServiceProviderTrait

This package used to ship its own `Omega\Filesystem\AppServiceProviderTrait`, but
that copy was removed: it was an outdated duplicate of the one in
`Omega\Container` (missing `is_readable` checks in `fileWrite`/`importDir`). Use
`Omega\Container\AppServiceProviderTrait` instead:

```php
use Omega\Container\AppServiceProviderTrait;

final class MyProvider extends AbstractServiceProvider
{
    use AppServiceProviderTrait;

    public function boot(): void
    {
        static::importFile('vendor/pkg/config/widgets.php', '/path/to/config/widgets.php');
        static::importDir('vendor/pkg/resources/views', '/path/to/resources/views');
        static::export(['vendor/pkg/config' => '/config'], 'widgets');
        static::getModules();    // all exported path maps
        static::flushModule();   // reset the module registry
    }
}
```

`importFile()`/`importDir()` return `false` for unreadable sources and throw
`Exception('You do not have permission to overwrite the destination file.')`
when a destination exists and `$overwrite` is false.

## Exceptions

Everything under `Omega\Filesystem\Exception` implements `ExceptionInterface`:

| Exception | Base | When thrown |
| --------- | ---- | ----------- |
| `FileNotFoundException` | `RuntimeException` | Operation expects a file that is missing (`The file "%s" was not found.`) |
| `FileAlreadyExistsException` | `RuntimeException` | `write()` with `$overwrite = false` on an existing file |
| `UnexpectedFileExcption` (sic, class name typo in source) | `RuntimeException` | `rename()` target already exists (`was not supposed to exist`) |
| `+ LogicException` | | MIME type requested from an adapter without support |
| `+ OutOfBoundsException` | | Local adapter path escaping its base directory |

## Notes

- The `UnsupportedAdapterException` still exists under `Omega\Filesystem\Exception`,
  but it is **unused** — it was only referenced by the legacy `FilesystemFactory`
  (see below), which has been removed.
- **The container binding is no longer shipped.** The legacy `FilesystemServiceProvider`
  (which implemented a non-existent `ServiceProviderInterface` and called
  `$app->alias('filesystem', Closure)`, importing a non-existent
  `Omega\Support\Facade\Facades\Config` facade) was removed. Treat `app('filesystem')`
  as unavailable and construct `Filesystem` directly.
- **The Factory is gone.** `FilesystemFactory`/`FilesystemFactoryInterface` were
  deleted — they referenced a non-existent `Omega\Container\Contracts\Factory\GenericFactoryInterface`
  and the old `Omega\Support\...` facade. Build adapters with `new Local(...)` etc.
  directly.
- **Tests exist now.** `tests/Unit/Filesystem/` covers the whole package (183 Pest
  tests targeting 100% line/branch/path coverage): `Filesystem`, `File`,
  `FilesystemMap`, the `Local` and `InMemory` adapters, `StreamMode`/`Local`/
  `InMemoryBuffer`, and the `Util` helpers. FTP, SFTP and the Amazon S3 adapters
  are not covered (they require external services / package SDKs).
- Helper file: none. Facade: none. The package does not read any `filesystem`
  config key; construct adapters and the `Filesystem` class directly.
- Source typo to be aware of: class `UnexpectedFileExcption` (missing 'e' in
  "Exception"). The former `Omega\Filesystem\Uti\Path` typo in `Stream\Local` has
  been fixed to `Util\Path`.
- The `Path::normalize()` helper is a pure string resolver (no filesystem I/O): it
  replaces backslashes, resolves `.`/`..` segments and collapses duplicate slashes;
  `getAbsolutePrefix()` recognizes drive letters (e.g. `c:`) with optional slashes;
  `dirname()` normalizes backslashes before delegating to PHP's `dirname()`.
- `InMemory::read()` returns `false` for keys that do not exist (was `null`), and
  `InMemory::delete()` always returns `true`.

## Reference

- `Filesystem.php`, `FilesystemInterface.php`, `File.php`
- `FilesystemMap.php`, `FilesystemMapInterface.php`
- `Adapter/` (`FilesystemAdapterInterface`, `Local`, `Sftp`, `Ftp`, `Amazon/AwsS3`,
  `Amazon/AsyncAwsS3`, `Memory/InMemory`)
- `Contracts/`, `Stream/`, `Util/`, `Exception/`
- License: GPL-3.0+