# Omega MVC — Config Package Manual

The `Omega\Config` package provides the application configuration repository: a
dot-notation key/value store built over plain PHP config files, with array/JSON/XML
sources, merge strategies, and a bootstrap step that loads the application config at
startup.

## Config files

Config lives in PHP files that `return` an associative array. The
`ConfigBootstrapper` scans the config directory (`path.config`), requires every
`*.php` file, and merges them with `array_replace_recursive`. You can split config
into multiple files (`app.php`, `database.php`, `cache.php`...).

```php
// config/app.php
return [
    'name'    => 'Omega',
    'debug'   => false,
    'database' => [
        'default' => 'sqlite',
        'connections' => [
            'sqlite' => ['driver' => 'sqlite', 'database' => ':memory:'],
        ],
    ],
];
```

Values are read with dot notation: `config('database.default')` resolves to
`'sqlite'`.

## Facade

```php
use Omega\Config\Facade\Config;

Config::get('app.name', 'default');       // value or default
Config::has('app.debug');                 // bool
Config::set('app.debug', true);           // set (also via array-access: $config['k'] = v)
Config::push('cache.paths', '/tmp');      // append to an array key
Config::getAll();                         // the whole config array
```

The `Config` facade resolves the container binding `ConfigRepository::class`.

## Repository API

```php
use Omega\Config\ConfigRepository;

$config = new ConfigRepository(['key' => 'value']);

$config->get('nested.key', 'fallback');   // dot-notation get
$config->has('nested.key');
$config->set('nested.key', 'value');      // auto-creates intermediate arrays
$config->remove('nested.key');            // unset leaf
$config->push('timeline', 'entry');       // append
$config->clear();                         // reset to []
$config->getAll();
```

`ConfigRepository` implements `ArrayAccess` (so `$config['db.port']` works),
`Countable`, and `IteratorAggregate`.

## Merging repositories

```php
use Omega\Config\ConfigRepository;
use Omega\Config\MergeStrategy;

$base  = new ConfigRepository(['indexed' => [1, 2, 3]]);
$extra = new ConfigRepository(['indexed' => [3, 4, 5]]);

$base->merge($extra);                                   // replace indexed arrays (default)
$base->merge($extra, null, MergeStrategy::MERGE_INDEXED);   // [1,2,3,4,5]
$base->merge($extra, null, MergeStrategy::MERGE_ADD_NEW);   // keep existing keys

// Merge into a specific sub-key:
$base->merge($extra, 'nested');
```

Strategies:

- `REPLACE_INDEXED` (default) — indexed arrays are replaced wholesale; associative
  sub-arrays merge recursively.
- `MERGE_INDEXED` — indexed arrays merge and deduplicate with `array_unique`.
- `MERGE_ADD_NEW` — only keys that do not exist in the target are added.

## Sources and ConfigBuilder

Sources describe where config data comes from; each implements `SourceInterface`
with a single `fetch(): array`:

```php
use Omega\Config\ConfigBuilder;
use Omega\Config\Source\ArrayConfig;
use Omega\Config\Source\JsonConfig;
use Omega\Config\Source\XmlConfig;

// In-memory array, JSON file, XML file:
new ArrayConfig(['key' => 'value']);
new JsonConfig($jsonFilePath);
new XmlConfig($xmlFilePath);
```

Load several sources into one repository, optionally grouped under a section and
ordered by priority (higher priority wins):

```php
$builder = new ConfigBuilder();

$config = $builder
    ->addConfiguration(new ArrayConfig(['key' => 'value']))
    ->addConfiguration(new JsonConfig('defaults.json'))
    ->addConfiguration(new ArrayConfig(['private' => 'x']), 'secrets', 10)
    ->build();
```

Call `build(MergeStrategy::MERGE_INDEXED)` (or `MERGE_ADD_NEW`, `REPLACE_INDEXED`)
to override the default merge strategy for the whole build.

### Using merge strategies alongside sources

`MergeStrategy` also drives merging into a specific section, and works with any
repository — so you can layer configs with different semantics per source:

```php
use Omega\Config\ConfigBuilder;
use Omega\Config\ConfigRepository;
use Omega\Config\MergeStrategy;
use Omega\Config\Source\ArrayConfig;
use Omega\Config\Source\JsonConfig;

$builder = new ConfigBuilder();

// lower priority first; higher priority later sources win on conflicts
$config = $builder
    ->addConfiguration(new JsonConfig(base_path('config/defaults.json')), 'app', 10)
    ->addConfiguration(new ArrayConfig(['debug' => true]), 'app', 50)
    ->addConfiguration(new ArrayConfig(['cache.stores' => ['array']]), null, 100)
    ->build(MergeStrategy::REPLACE_INDEXED);

// or merge with per-section strategy on an existing repository:
$repo = new ConfigRepository(['cache.stores' => ['file', 'redis']]);
$repo->merge(
    new ConfigRepository(['cache.stores' => ['array']]),
    'cache',
    MergeStrategy::MERGE_INDEXED
);
```

### Note — these are public, standalone APIs

The injection-based classes (`ConfigBuilder`, `MergeStrategy`, and the `Source\`
implementations `ArrayConfig`, `JsonConfig`, `XmlConfig`) are fully public and can
be composed by application code, but they are **not** invoked by the framework
bootstrap. The default `ConfigBootstrapper` loads only `*.php` files from
`path.config` (or the cached `config.php`) and merges them with
`array_replace_recursive` — it never reads JSON/XML files or consults
`ConfigBuilder`. Use the sources/builder directly when you need non-PHP formats,
layered/priority merging, or a repository assembled at runtime.

## ConfigSource — macro-ready API

`ConfigSource` is a convenient, macroable facade-friendly entry point over
`ConfigBuilder` and the `Source\` implementations. It lets you assemble a
repository from array/JSON/XML sources with section grouping and priority, and
extend it at runtime with custom formats via `Macroable`:

```php
use Omega\Config\ConfigSource;

$config = (new ConfigSource())
    ->fromArray(['debug' => true])
    ->fromJson(base_path('config/secrets.json'), 'secrets', 50)
    ->fromXml(base_path('config/security.xml'))
    ->build();
```

Higher-priority sources win on conflicting keys (the default strategy is
`REPLACE_INDEXED`; pass `MergeStrategy::MERGE_INDEXED` to `build()` to merge
indexed arrays).

Extend it with a macro for any other format (YAML, INI, ...):

```php
ConfigSource::macro('fromYaml', function (string $file, ?string $section = null): ConfigSource {
    return $this->fromArray(yaml_parse_file($file), $section);
});

$config = ConfigSource::fromYaml(base_path('config/deploy.yml'))->build();
```

The `Config` facade resolves `ConfigSource::class` from the container, so the
same call surface (including registered macros) is available statically —
provided the facade has an application set:

```php
use Omega\Config\Facade\ConfigSource as ConfigSourceFacade;

ConfigSourceFacade::fromJson(base_path('config/extra.json'), 'extra', 20)->build();
```

`ConfigSource::macro()`, `ConfigSource::hasMacro()` and `ConfigSource::resetMacro()`
(delegated to `Macroable`) are available for registration and lifecycle control.

## Bootstrapping

In a framework application the `ConfigBootstrapper::bootstrap(ApplicationInterface)`
loads all config files (or a cached `config.php` from the application cache path),
builds the `ConfigRepository`, pushes it into the application via
`$app->loadConfig(...)`, and sets the default timezone from `env('APP_TIMEZONE')`
(`'UTC'` fallback). Results are cached statically so persistent workers do not
re-read config on every request.

## Exceptions

All implement `Omega\Config\Exceptions\ConfigExceptionInterface`:

| Exception | When thrown |
| --------- | ----------- |
| `FileReadException` | a source file cannot be read |
| `MalformedJsonException` | a JSON source cannot be decoded |
| `MalformedXmlException` | an XML source cannot be parsed |
| `InvalidArrayConfigException` | an `ArrayConfig` is empty or not associative |

`ConfigBootstrapper` additionally throws `RuntimeException` if a config or cache file
does not return an array.

## Reference

- `ConfigRepository.php`, `AbstractConfigRepository.php`, `ConfigRepositoryInterface.php`
- `ConfigTrait.php`, `MergeStrategy.php`, `ConfigBuilder.php`, `ConfigSource.php`
- `Source/` — `SourceInterface`, `AbstractSource`, `ArrayConfig`, `JsonConfig`, `XmlConfig`
- `Bootstrapper/ConfigBootstrapper.php`
- Facades: `Facade/Config.php` (accessor `ConfigRepository::class`), `Facade/ConfigSource.php` (accessor `ConfigSource::class`)
- Exceptions: `Exceptions/`
- License: GPL-3.0+