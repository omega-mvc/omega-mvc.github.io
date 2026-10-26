# Omega MVC — Collection Package Manual

The `Omega\Collection` package provides a powerful, chainable wrapper around PHP
arrays. It is used throughout the framework (query builder results, model
collections, configuration data) and is also available standalone.

## Creating a collection

```php
use Omega\Collection\Collection;
use function Omega\Collection\collection;
use function Omega\Collection\collection_immutable;

$users = new Collection(['taylor', 'nuno', 'giovannini']);
$empty = collection();                        // empty mutable collection
$more  = collection([1, 2, 3]);               // from an array
$fixed = collection_immutable(['a', 'b']);    // immutable variant
```

A `Collection` behaves like an array: it implements `ArrayAccess` (including
`$users['name']` and `$users->name` magic access), `IteratorAggregate`, and
`Countable`.

## Immutable vs mutable

- `Collection` — mutable: `set()`, `push()`, `remove()`, `map()`, `filter()`,
  `sort()`, etc. modify the instance and return `$this` for chaining.
- `CollectionImmutable` — immutable: mutating via array-access syntax throws
  `Omega\Collection\Exceptions\ImmutableCollectionException`. Read-only operations
  (`get`, `has`, `filter`, `map`, `each`, ...) work exactly the same.
- Any collection can be converted to an immutable one with
  `$collection->immutable()`.

## Reading values

```php
$users->all();                       // raw array
$users->get('name', 'default');      // value or default
$users->has('name');                 // key exists
$users->contain('taylor');           // value exists (optional $strict)
$users->keys();                      // list of keys
$users->items();                     // list of values
$users->count();                     // same as count($collection)
$users->first();  $users->firsts(3); // first / first N
$users->last();   $users->lasts(3);  // last / last N
$users->firstKey(); $users->lastKey();
$users->isEmpty();  $users->length();
$users->sum();  $users->avg();  $users->min();  $users->max('price');
$users->rand();  $users->current(); … $users->next(); $users->prev();
$users->json();                      // JSON string
$users->toArray();
```

## Transforming (fluent, returns `$this` on `Collection`)

```php
$users
    ->map(fn ($user) => strtoupper($user))                    // transform each item
    ->filter(fn ($user) => str_contains($user, 'a'))          // keep matching
    ->reject(fn ($user) => $user === 'zzz')                   // drop matching
    ->sort()                                                  // ascending by value
    ->sortDesc()                                              // descending by value
    ->sortBy(fn ($a, $b) => $a <=> $b)                        // custom comparator
    ->sortByDesc(fn ($a, $b) => $a <=> $b)
    ->sortKey()  ->sortKeyDesc()                              // by key
    ->reverse()  ->shuffle()
    ->take(5)                                                 // first 5 (or last 5 with -5)
    ->take(-3)
    ->only(['id', 'name'])   ->except(['password'])           // keep/drop by key
    ->diff(['blocked'])      ->diffKeys(...)  ->diffAssoc(...) // remove by value/key/pair
    ->complement(['a'])                      // keep values not present in the current collection
    ->complementKeys(['a'])                  // keep keys not present in the current collection
    ->complementAssoc([...])                 // keep key/value pairs not present in the current collection
    ->where('age', '>', 18)   ->whereIn('role', ['admin'])    // filter sub-array items
    ->whereNotIn('role', ['guest'])
    ->add(['extra' => 1])     ->ref($otherCollection)         // merge arrays / collections
    ->set('name', 'Omega')    ->push('new-item')              // add values
    ->remove('name')          ->clear()  ->replace($newArray)
    ->each(fn ($value, $key) => do_something($value));        // returns $this; return false to break
```

## Operations returning a new collection

```php
$copied = $users->clone();                                   // deep copy
$byEmail = $users->assocBy(fn ($u) => [$u['name'] => $u['email']]);
$chunked = $users->chunk(10);                                // throws on length < 1
$parts   = $users->split(3);                                  // split in N chunks
$flat    = $users->flatten();                                 // flatten nested arrays
$imm     = $users->immutable();
$accumulated = $users->reduce(fn ($carry, $item) => $carry + $item, 0);
```

## Inspecting content

```php
$users->some(fn ($u) => $u->isAdmin);       // at least one matches
$users->every(fn ($u) => $u->age > 18);     // all match
$users->countIf(fn ($u) => $u->active);     // count matching items
$users->countBy();                          // frequency map of stringable values
$users->dump();                             // var_dump ($this)
$users->pluck('email');                     // ['taylor@x', ...]
$users->pluck('email', 'id');               // [1 => 'taylor@x', ...]
```

## `data_get()` — dot-notation accessor

```php
use function Omega\Collection\data_get;

$config = ['mail' => ['smtp' => ['host' => 'smtp.example.org']]];

$host = data_get($config, 'mail.smtp.host');            // 'smtp.example.org'
$none = data_get($config, 'a.b.c', 'fallback');         // 'fallback'

// Wildcard '*' plucks from arrays of arrays:
data_get(['a' => ['x' => 1], 'b' => ['x' => 2]], '*.x');  // [1, 2]
```

## Exceptions

- `Omega\Collection\Exceptions\ImmutableCollectionException` — thrown when mutating
  a `CollectionImmutable` via `$coll['key'] = ...` or `unset($coll['key'])`.

## Reference

- `Collection.php`, `CollectionImmutable.php`, `AbstractCollectionImmutable.php`,
  `CollectionInterface.php`
- `helper.php` — `collection()`, `collection_immutable()`, `data_get()`
- Exception: `Exceptions/ImmutableCollectionException.php`
- License: GPL-3.0+