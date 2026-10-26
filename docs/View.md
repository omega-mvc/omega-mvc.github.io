# Omega MVC — View Package Manual

The `Omega\View` package renders and serves views. It ships two renderers:

- **`View`** — a minimal static renderer that `require_once`s a raw PHP template and
  returns a `Response`.
- **`Templator`** — the full template engine with directives (`{% ... %}`), layout
  inheritance, components, caching, and Vite asset injection. This is what is bound
  in the container and used by the `view()` helper.

## Configuration

The `ViewServiceProvider` wires everything from application paths and config:

| Config / path         | Default source                         | Used for                          |
| --------------------- | -------------------------------------- | --------------------------------- |
| `paths.view`          | `basePath/resources/views`             | `TemplatorFinder` root paths      |
| `path.compiled_view_path` | `basePath/storage/app/view`        | compiled template cache directory |
| `path.public`         | `basePath/public`                      | `Vite` public path + build dir    |
| `VIEW_EXTENSIONS`     | `['.template.php', '.php']`            | template file extensions          |

Container bindings registered by the package: `view.instance` (the `Templator`),
`view.response` (a render closure returning a `Response`), `vite.gets` (the `Vite`
manager), `vite.location`, `vite.hasManifest`, `TemplatorFinder::class`. Every
rendered view also receives `vite_has_manifest` and `vite_hmr_script` in its data.

## Rendering a view

### Global `view()` helper

```php
use function Omega\View\view;

// Returns a Response; data is passed as the 2nd argument.
$response = view('page', ['name' => 'Taylor'], ['status' => 200]);

// Custom headers:
$response = view('page', $data, [
    'status' => 404,
    'header' => ['X-Custom' => 'value'],
]);

echo $response->getStatusCode();
echo $response->getContent();
```

`view()` resolves `view.response`, which renders the named view through the
`Templator` and wraps the result in a `Response`.

### Templator / View facade

```php
use Omega\View\Facades\View;

$html = View::render('page', ['name' => 'Taylor']);        // renders + compiles
$html = View::render('if', ['true' => true], false);       // skip the compiled cache
$bool = View::viewExist('page');
$code = View::compile('page');                             // compile without rendering
View::setFinder($finder);
```

> **Note:** the real signature is `render(string $templateName, array $data, bool $cache = true)` —
> the template name comes first.

### Static `View` renderer (raw PHP files)

```php
use Omega\View\View;

$response = View::render('/full/path/to/template.php', [
    'auth'     => $authUser,
    'meta'     => ['title' => 'Home'],
    'contents' => ['body' => 'Hello'],
]);
```

The file is included directly; the data is exposed through the readonly `$auth`,
`$meta` and `$content` `Portal` objects (`$auth->name`, `$content->has('body')`).
Throws `ViewFileNotFoundException` when the file does not exist.

## Template directives

Templates live under `resources/views` and are referenced by logical names that map
to `name.template.php` or `name.php`.

### Output

```
{{ $name }}          {# escaped echo #}
{!! $html !!}        {# raw echo #}
{% raw %}{{ untouched }}{% endraw %}
```

### Layouts and sections

```
{# resources/views/layout.template.php #}
<html>
<head><title>{% yield('title', 'Default') %}</title></head>
<body>
    {% yield('content') %}
</body>
</html>

{# resources/views/page.template.php #}
{% extend('layout') %}
{% section('title') %}My Page{% endsection %}
{% section('content') %}
    <h1>Hello {{ $name }}</h1>
{% endsection %}
```

`{% yield('name') %}`, `{% yield('name', 'default') %}`, `{% yield %}` (the default
named `content`) and the `{% sections %}...{% endsections %}` batch form are also
available.

### If / loops / comments

```
{% if ($user->isAdmin) %}
    {% foreach ($items as $item) %}{{ $item->name }};{% endforeach %}
    {% continue %}  {# / {% continue 2 %} #}
    {% break %}     {# / {% break 2 %} #}
{% else %}
    Nobody
{% endif %}

{# a comment #}
```

### Includes and components

```
{% include('partials/guest') %}

{% component('CardComponent', title: 'Hello', body: 'World') %}
    Default slot content
{% endcomponent %}
```

Components can be class-based (namespace + component name resolved through
`setComponentNamespace()`), or template-based, receiving slots via `{% yield('slot') %}`.

### Miscellaneous directives

| Directive | Purpose |
| --------- | ------- |
| `{% set $x = expr %}` | assign a variable |
| `{% json($value [, $flags [, $depth]]) %}` | escaped `json_encode` echo |
| `{% bool($expr) %}` | `(expr) ? 'true' : 'false'` |
| `{% php %}...{% endphp %}` | inline raw PHP |
| `{% use('Namespace\Class') %}` | emit `use` statements in compiled output |

### Custom directives

```php
use Omega\View\Templator\DirectiveTemplator;

$cb = static fn (string $time): string => '<time>' . $time . '</time>';

$result = DirectiveTemplator::register('time', $cb);   // throws DirectiveCanNotBeRegisterException
// then use {% time('now') %} in templates
```

Reserved names cannot be re-registered: `break`, `component`, `continue`, `else`,
`extend`, `foreach`, `if`, `include`, `bool`, `json`, `php`, `raw`, `section`, `set`,
`use`, `yield`. Call `DirectiveTemplator::reset()` at request boundaries in
persistent workers.

## Vite assets

The `Vite` manager reads the compiled asset manifest (`public/build/manifest.json`)
and emits the correct `<link>` and `<script>` tags, automatically separating CSS from
JS. When a `hot` file exists in the public path it switches to HMR mode and injects
the dev client script.

```php
use function Omega\View\vite;

// Single entry -> string; multiple entries -> array<string,string>.
echo vite('resources/css/app.css', 'resources/js/app.js');
```

Inside a layout:

```
{{ TAGS: {!! vite('resources/css/app.css', 'resources/js/app.js') !!} }}
```

```php
use Omega\View\Facades\Vite;

Vite::manifestName('manifest.json');
Vite::getTags(['resources/js/app.js'], ['defer' => true]);
Vite::getPreloadTags(['resources/js/app.js']);
$running = Vite::isRunningHRM();
Vite::flush();   // reset the manifest cache at request boundaries
```

## Cache clearing

Compiled templates are stored under `path.compiled_view_path` keyed by
`md5(name).php`. Clear them with the console command:

```bash
php omega view:clear
```

## Exceptions

- `ViewFileNotFoundException` — template file not found.
- `DirectiveCanNotBeRegisterException` — re-registering a reserved directive.
- `DirectiveNotRegisterException` — calling an unregistered custom directive.
- `YeldSectionNotFoundException` — `{% yield %}` without a matching section.
- `ViewExceptionInterface` / `AbstractViewException` — base types for the above.

## Reference

- Renderers: `View.php`, `Templator.php`, `TemplatorFinder.php`
- Facades: `Facades/View.php` (`view.instance`), `Facades/Vite.php` (`vite.gets`)
- Helpers: `helper.php` (`view()`, `vite()`)
- Directives: `Templator/` (15 classes), `AbstractTemplatorParse.php`,
  `DependencyTemplatorInterface.php`, `InteractWithCacheTrait.php`
- Assets: `Vite.php`, `Portal.php`
- Provider: `ViewServiceProvider.php`
- Exceptions: `Exceptions/`
- License: GPL-3.0+