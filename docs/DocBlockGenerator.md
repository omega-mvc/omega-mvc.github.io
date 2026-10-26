# Omega MVC — DocBlockGenerator Package Manual

The `Omega\DocBlockGenerator` package provides a fluent, programmatic API for generating
PHP class, abstract class, and trait source code — including properties, methods, constants,
docblock comments, and formatted output. It also includes a `VarExport` engine for serializing
PHP values (including closures and objects) back into executable PHP return statements.

## Installation

The package ships with the framework and is autoloaded via Composer:

```bash
composer require omega-mvc/framework
```

## Core classes

| Class | Purpose |
| ----- | ------- |
| `Generate` | Top-level generator for class/trait/abstract declarations |
| `Method` | Represents a single method definition |
| `Property` | Represents a single property definition |
| `Constant` | Represents a single class constant definition |
| `MethodPool` | Collects multiple `Method` objects for batch insertion |
| `PropertyPool` | Collects multiple `Property` objects for batch insertion |
| `ConstPool` | Collects multiple `Constant` objects for batch insertion |
| `VarExport` | Serializes PHP values into executable PHP code |

## Generate

`Generate` is the entry point for building a complete PHP class file. All setter methods
return `$this` for fluent chaining.

### Class constants

| Constant | Value | Meaning |
| -------- | ----- | ------- |
| `SET_CLASS` | `0` | Regular class |
| `SET_ABSTRACT` | `1` | Abstract class |
| `SET_TRAIT` | `2` | Trait |

### Usage

```php
use Omega\DocBlockGenerator\Generate;
use Omega\DocBlockGenerator\Method;
use Omega\DocBlockGenerator\Property;

$code = (new Generate('UserService'))
    ->namespace('App\\Service')
    ->use('Psr\\Log\\LoggerInterface')
    ->extend('AbstractService')
    ->implement('LoggerAwareInterface')
    ->rule(Generate::SET_ABSTRACT)
    ->setFinal()
    ->setDeclareStrictTypes()
    ->addProperty('name')
        ->dataType('string')
        ->visibility(Property::PRIVATE_)
    ->methods(function ($pool) {
        $pool->name('getName')
            ->visibility(Method::PUBLIC_)
            ->setReturnType('string')
            ->body('return $this->name;');
    })
    ->generate();

echo $code;
```

### API reference — Generate

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(string $name = 'NewClass')` | — | Create generator with a class name |
| `__invoke(string $name): self` | `self` | Rename the class being generated |
| `static(string $name): self` | `self` | Static factory |
| `generate(): string` | `string` | Render the full PHP source code |
| `save(string $pathToSave): int\|false` | `int\|false` | Write the generated file to disk |
| `rule(int $rule): self` | `self` | Set class/abstract/trait rule |
| `setFinal(bool $isFinal = true): self` | `self` | Mark as `final` |
| `setEndWithNewLine(bool $enable = true): self` | `self` | Append trailing newline |
| `addDeclare(string $directive, string\|int $value): self` | `self` | Add a `declare` directive |
| `setDeclareStrictTypes(int $level = 1): self` | `self` | Shorthand for `addDeclare('strict_types', 1)` |
| `name(string $name): self` | `self` | Set the class name |
| `namespace(string $namespace): self` | `self` | Set the namespace |
| `use(string $useNamespace): self` | `self` | Add a single `use` import |
| `uses(array $usesNamespace): self` | `self` | Set multiple `use` imports |
| `extend(string $extend): self` | `self` | Set the parent class |
| `implement(string $implement): self` | `self` | Add a single interface |
| `implements(array $implements): self` | `self` | Set multiple interfaces |
| `trait(string $trait): self` | `self` | Add a single trait |
| `traits(array $traits): self` | `self` | Set multiple traits |
| `body(string $rawBody): self` | `self` | Append raw PHP to the class body |
| `addConst(string $name): Constant` | `Constant` | Add a single constant (returns it for further config) |
| `constants(callable\|ConstPool\|Constant $newConst): self` | `self` | Add one or many constants |
| `addProperty(string $name): Property` | `Property` | Add a single property |
| `properties(callable\|Property\|PropertyPool $newProperty): self` | `self` | Add one or many properties |
| `addMethod(string $name): Method` | `Method` | Add a single method |
| `methods(MethodPool\|callable\|Method $newMethod): self` | `self` | Add one or many methods |
| `preReplace(array\|string $search, array\|string $replace): self` | `self` | Pre-generation search/replace |
| `replace(array\|string $search, array\|string $replace): self` | `self` | Post-generation search/replace |

## Method

Represents a single method definition. Uses `FormatterTrait` and `CommentTrait`.

### Visibility constants

| Constant | Value |
| -------- | ----- |
| `PUBLIC_` | `0` |
| `PRIVATE_` | `1` |
| `PROTECTED_` | `2` |

```php
use Omega\DocBlockGenerator\Method;

$method = Method::new('doWork')
    ->visibility(Method::PUBLIC_)
    ->setStatic()
    ->setReturnType('void')
    ->addParam('string $input')
    ->body('echo $input;');

echo $method->generate();
```

### API reference — Method

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(string $name)` | — | Create a new method |
| `new(string $name): self` | `self` | Static factory |
| `generate(): string` | `string` | Render the method source |
| `name(string $name): self` | `self` | Set the method name |
| `visibility(int $visibility): self` | `self` | Set visibility |
| `setFinal(bool $isFinal = true): self` | `self` | Enable/disable `final` |
| `setStatic(bool $isStatic = true): self` | `self` | Enable/disable `static` |
| `params(?array $params): self` | `self` | Set the full parameter list |
| `addParams(string $param): self` | `self` | Append a parameter |
| `setReturnType(?string $returnType): self` | `self` | Set the return type |
| `body(array\|string\|null $body): self` | `self` | Set the method body |

## Property

Represents a single class property. Uses `FormatterTrait` and `CommentTrait`.

```php
use Omega\DocBlockGenerator\Property;

$prop = Property::new('count')
    ->dataType('int')
    ->visibility(Property::PRIVATE_)
    ->setStatic()
    ->expecting('0');

echo $prop->generate(); // private static int $count = 0;
```

### API reference — Property

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(string $name)` | — | Create a new property |
| `new(string $name): self` | `self` | Static factory |
| `generate(): string` | `string` | Render the property source |
| `setStatic(bool $isStatic = true): self` | `self` | Enable/disable `static` |
| `visibility(int $visibility): self` | `self` | Set visibility |
| `dataType(string $dataType): self` | `self` | Set the property type |
| `name(string $name): self` | `self` | Set the property name |
| `expecting(array\|string $expecting): self` | `self` | Set the default/expected value |

## Constant

Represents a single class constant. Uses `FormatterTrait` and `CommentTrait`.

```php
use Omega\DocBlockGenerator\Constant;

$const = Constant::new('MAX_RETRIES')
    ->visibility(Constant::PUBLIC_)
    ->equal('3');

echo $const->generate(); // public const MAX_RETRIES = 3;
```

### API reference — Constant

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct(string $name)` | — | Create a new constant |
| `new(string $name): self` | `self` | Static factory |
| `generate(): string` | `string` | Render the constant source |
| `visibility(int $visibility): self` | `self` | Set visibility |
| `name(string $name): self` | `self` | Rename the constant |
| `expecting(string $expecting): self` | `self` | Set raw assignment expression (e.g. `"= 'val'"`) |
| `equal(string $expectingWith): self` | `self` | Set value with automatic `"= "` prefix |

## Pool classes

`MethodPool`, `PropertyPool`, and `ConstPool` are batch-collection containers. Each
exposes `name(string $name)` to create and store an instance, and `getPools()` to
retrieve all stored items.

```php
$code = (new Generate('MyClass'))
    ->properties(function ($pool) {
        $pool->name('foo')->dataType('string')->visibility(Property::PUBLIC_);
        $pool->name('bar')->dataType('int')->expecting('42');
    })
    ->methods(function ($pool) {
        $pool->name('getFoo')->visibility(Method::PUBLIC_)->setReturnType('string')->body('return $this->foo;');
        $pool->name('getBar')->visibility(Method::PUBLIC_)->setReturnType('int')->body('return $this->bar;');
    })
    ->generate();
```

## FormatterTrait

Used by `Generate`, `Method`, `Property`, and `Constant`. Provides formatting control:

| Method | Description |
| ------ | ----------- |
| `tabSize(int $tabSize): self` | Set the number of indentation units per level |
| `tabIndent(string $tabIndent): self` | Set the indentation character (default `"\t"`) |
| `customizeTemplate(string $template): self` | Override the default code template |

## CommentTrait

Used by `Generate`, `Method`, `Property`, and `Constant`. Provides docblock generation:

| Method | Description |
| ------ | ----------- |
| `addComment(?string $comment): self` | Append a raw comment line (null for blank) |
| `addLineComment(): self` | Append a blank separator line |
| `addParamComment(string $datatype, string $name, string $description): self` | Add `@param` annotation |
| `addVariableComment(string $datatype, string $name): self` | Add `@var` annotation |
| `addReturnComment(string $datatype, string $name, string $description): self` | Add `@return` annotation |
| `generateComment(int $tabSize, string $tabIndent): string` | Render the docblock string |

## VarExport

`VarExport` serializes PHP data structures back into executable PHP `return` statements.
It supports scalars, arrays, `stdClass`, objects (via `__set_state()`), closures (extracted
from source files), and the `Constant` value object (which exports a constant name rather
than its value).

```php
use Omega\DocBlockGenerator\VarExport;

$exporter = new VarExport();

// Export to a string
$code = $exporter->export([
    'name' => 'Omega',
    'version' => 2.0,
    'features' => ['routing', 'mvc', 'di'],
]);

// Compile directly to a file
$exporter->compile($data, 'config/cached.php');
```

### API reference — VarExport

| Method | Return | Description |
| ------ | ------ | ----------- |
| `__construct()` | — | Create a new exporter |
| `setIndentation(string $indent): self` | `self` | Set indentation string (default `"    "`) |
| `setIndentationLevel(int $indentLevel): self` | `self` | Set initial indentation level |
| `setAlignArray(bool $align = true): self` | `self` | Enable aligned array key output |
| `export(array $data): string` | `string` | Serialize data to a PHP expression string |
| `compileToString(array $data): string` | `string` | Full PHP file with `<?php` header and `return` statement |
| `compile(array $data, string $fileName): bool` | `bool` | Write compiled PHP to a file |

### VarExport\Value\Constant

When placed inside a data array, `VarExport\Value\Constant` outputs the constant name
verbatim instead of serializing it:

```php
use Omega\DocBlockGenerator\VarExport;
use Omega\DocBlockGenerator\VarExport\Value\Constant;

$exporter = new VarExport();
$code = $exporter->export([
    'mode' => new Constant('App::MODE_PROD'),
]);
// Returns: ['mode' => App::MODE_PROD,]
```

## Exceptions

All exceptions in this package extend `InvalidArgumentException` or `RuntimeException`.

| Exception | Thrown when |
| --------- | ----------- |
| `InvalidArgumentException` (from `VarExport\Compiler\ClosureCompiler`) | A non-`Closure` is passed to `ClosureCompiler::compile()` |
| `InvalidArgumentException` (from `VarExport\ClosureExtractor`) | The closure has no source file, cannot be tokenized, or contains multiple closures on one line |

## Notes

- All `Generate`, `Method`, `Property`, and `Constant` instances implement `__toString()`, so
  they can be cast to string directly.
- `CommentTrait` is only active when at least one comment line has been added; otherwise
  `generateComment()` returns an empty string.
- The `VarExport` engine handles recursion by inserting `null /* RECURSION */` for circular
  object references.

## Reference

- Source: `src/Omega/DocBlockGenerator/`
- Tests: `tests/Unit/DocBlockGenerator/`
- License: GPL-3.0+
