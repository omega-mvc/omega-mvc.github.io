# Omega MVC — Event Package Manual

The `Omega\Event` package provides a lightweight event dispatcher. Events are
objects implementing `EventInterface` (name + named arguments); listeners are
callables registered by event name and run in priority order. The package is used
internally by `Database\Model` (lifecycle events), `Exceptions\ExceptionHandler`
(exception logging), and is available standalone.

## The dispatcher

```php
use Omega\Event\Dispatcher\Dispatcher;
use Omega\Event\Dispatcher\DispatcherInterface;

$dispatcher = new Dispatcher();
// type-hint against DispatcherInterface in your application code
```

### Adding and removing listeners

```php
use Omega\Event\EventInterface;
use Omega\Event\Priority;

$dispatcher->addListener('user.registered', function (EventInterface $event): void {
    $email = $event->getArgument('email');
    // ...
}, Priority::NORMAL->value /* or any raw int; higher runs first, default 0 */);

$dispatcher->addListener('user.registered', $listener);
$dispatcher->getListenerPriority('user.registered', $listener);  // ?int
$dispatcher->getListeners('user.registered');                    // callable[] ordered by priority
$dispatcher->getListeners();                                     // ['event' => [callable...], ...]
$dispatcher->hasListener($listener);                             // any event
$dispatcher->hasListener($listener, 'user.registered');          // that event only
$dispatcher->countListeners('user.registered');
$dispatcher->removeListener('user.registered', $listener);
$dispatcher->clearListeners();        // all events (chainable)
$dispatcher->clearListeners('user.registered');
```

### Subscribers

A subscriber groups multiple listeners. Implement `SubscriberInterface` with a
static `getSubscribedEvents(): array` map:

```php
use Omega\Event\Dispatcher\Dispatcher;
use Omega\Event\EventInterface;
use Omega\Event\Priority;
use Omega\Event\SubscriberInterface;

final class OrderSubscriber implements SubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [
            'order.placed'     => 'onPlaced',                     // default priority (NORMAL)
            'order.cancelled'  => ['onCancelled', Priority::HIGH], // enum priority
            'order.refunded'   => ['onRefunded', -1],              // raw int priority
        ];
    }

    public function onPlaced(EventInterface $event): void { }
    public function onCancelled(EventInterface $event): void
    {
        $event->stopPropagation();            // no later listeners run
    }
    public function onRefunded(EventInterface $event): void { }
}

$dispatcher->addSubscriber(new OrderSubscriber());
$dispatcher->removeSubscriber(new OrderSubscriber());
```

## Creating and dispatching events

```php
use Omega\Event\Dispatcher\Dispatcher;
use Omega\Event\Event;
use Omega\Event\EventImmutable;

$dispatcher = new Dispatcher();

// Mutable event — arguments can be set/removed before dispatch.
$event = new Event('user.registered');
$event->setArgument('email', 'worker@example.com');   // overwrite
$event->addArgument('userId', 42);                    // only if not already present
$event->getArgument('email');                         // 'worker@example.com'
$event->getArgument('missing', 'fallback');           // fallback
$event->hasArgument('userId');                        // true
$event->removeArgument('userId');                     // returns removed value or null
$event->getName();                                    // 'user.registered'

// Immutable variant:
$imm = new EventImmutable('order.placed', ['id' => 7]);

$dispatcher->dispatch($event);   // returns the (possibly mutated) event
```

Each listener is invoked with a single argument: the event object itself. A listener
can call `$event->stopPropagation()` to halt the remaining listeners for that event.

### Priority levels

```php
use Omega\Event\Priority;

Priority::MIN;            // -3
Priority::LOW;            // -2
Priority::BELOW_NORMAL;   // -1
Priority::NORMAL;         // 0
Priority::ABOVE_NORMAL;   // 1
Priority::HIGH;           // 2
Priority::MAX;            // 3
```

## Lazy service listeners

Resolve the listener from the container at dispatch time instead of holding the
service:

```php
use Omega\Container\ContainerInterface;
use Omega\Event\Dispatcher\Dispatcher;
use Omega\Event\LazyServiceEventListener;

$dispatcher->addListener(
    'user.registered',
    new LazyServiceEventListener($container, 'mailer', 'onUserRegistered')
);
```

The service (`'mailer'`) is resolved and `onUserRegistered($event)` called when the
event is dispatched. Throws `ServiceNotRegisteredException`,
`ServiceMethodNotFoundException`, `InvalidServiceMethodException`, or
`InvalidServiceListenerException` for invalid configuration.

## Dispatcher-aware classes

```php
use Omega\Event\Dispatcher\DispatcherAwareInterface;
use Omega\Event\Dispatcher\DispatcherAwareTrait;

class MyService implements DispatcherAwareInterface
{
    use DispatcherAwareTrait;

    public function doSomething(): void
    {
        $this->getDispatcher()->dispatch(new Event('thing.done'));
    }
}
```

`getDispatcher()` throws `DispatcherNotSetException` if no dispatcher was injected.

## Built-in event classes

| Event | Name | Payload |
| ----- | ---- | ------- |
| `ModelEvent` | `model.created`, `model.saved`, `model.deleted` | `model`, `table` (created/updated flag for `saved`) — dispatched by `Database\Model` |
| `ExceptionEvent` | `exception.logged` | `exception`, `level`, `message`, `class` — dispatched by `ExceptionHandler` |
| `RouteEvent` | `route.before`, `route.after` | — (defined but never dispatched) |
| `LogEvent` | `log.written` | — (defined but never dispatched) |

Built-in listeners (all implement `SubscriberInterface`): `AuditTrailListener`
(model events — requires a logger via `setLogger()`), `CacheClearListener` (model
events — requires a cache manager via `setCacheManager(CacheManager $cache)`),
`ExceptionHandlerListener` (exception events — requires a logger via `setLogger()`,
priority 10).

## Service provider

`EventServiceProvider` registers the container bindings `DispatcherInterface::class`
(a dispatcher wired into `Model::setEventDispatcher()`) and `'events'` (a separate
`Dispatcher`). Resolve with `app()->get(DispatcherInterface::class)`.

## Exceptions

All under `Omega\Event\Exceptions`:

| Exception | When thrown |
| --------- | ----------- |
| `DispatcherNotSetException` | `getDispatcher()` without an injected dispatcher |
| `EventImmutableException` | mutating an `EventImmutable` or double-constructing it |
| `InvalidEventArgumentNameException` | `Event::offsetSet` with a null offset |
| `InvalidServiceListenerException` | `LazyServiceEventListener` with empty service id |
| `InvalidServiceMethodException` | non-callable service with empty method |
| `ServiceMethodNotFoundException` | method missing on resolved service |
| `ServiceNotRegisteredException` | service id missing from container |

## Notes

- There is **no** Event facade and **no** global `event()` helper.
- Ordering is dispatcher-side only: `Priority`/`ListenersPriorityQueue` sort by
  descending integer priority; equal priorities run in insertion order.
- In a persistent worker, re-register listeners per request (the provider's two
  bindings create separate `Dispatcher` instances).

## Reference

- `Dispatcher/Dispatcher.php`, `Dispatcher/DispatcherInterface.php`,
  `Dispatcher/DispatcherAwareInterface.php`, `Dispatcher/DispatcherAwareTrait.php`
- `AbstractEvent.php`, `Event.php`, `EventImmutable.php`, `EventInterface.php`
- `Priority.php`, `ListenersPriorityQueue.php`, `LazyServiceEventListener.php`
- `Events/`, `Listeners/`, `Exceptions/`
- `EventServiceProvider.php`
- License: GPL-3.0+