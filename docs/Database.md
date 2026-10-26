# Omega MVC — Database Package Manual

The `Omega\Database` package is the database layer of Omega MVC. It provides four
connection drivers (MySQL, MariaDB, PostgreSQL, SQLite), a fluent query builder, a
schema builder with blueprints, an active-record-style `Model`, and seeders.

## Configuration

Configure your connections in the application config. The provider reads
`db.default` and `db.connections`.

```php
'db' => [
    'default'     => 'mysql',
    'connections' => [
        'mysql' => [
            'driver'   => 'mysql',
            'host'     => '127.0.0.1',
            'port'     => 3306,
            'database' => 'omega',
            'username' => 'root',
            'password' => 'secret',
            'charset'  => 'utf8mb4',
        ],
        'sqlite' => [
            'driver'   => 'sqlite',
            'database' => ':memory:',   // or a filesystem path
        ],
    ],
],
```

Supported driver names: `mysql`, `mariadb`, `pgsql`, `sqlite`. Defaults: MariaDB port
`3306`/charset `utf8mb4`, PostgreSQL port `5432`/charset `utf8`, SQLite reads the
`path` key (falling back to `database`).

`DatabaseManager` throws `Omega\Database\Exceptions\InvalidConfigurationException`
when a requested connection name is not configured. PDO-level failures surface as
`PDOException`.

## Facades

| Facade | Accessor | Use for |
| ------ | -------- | ------- |
| `Omega\Database\Facades\DB` | `DatabaseManager` | named connections, query builder entry |
| `Omega\Database\Facades\PDO` | `database` (default connection) | raw PDO-style queries, transactions, logging |
| `Omega\Database\Facades\Schema` | `Schema` | schema builder (migrations) |

```php
use Omega\Database\Facades\DB;
use Omega\Database\Facades\PDO;
use Omega\Database\Facades\Schema;
```

## Raw queries and transactions

```php
// Direct, prepared-style access to the default connection:
$result = PDO::query('SELECT * FROM users WHERE user = :user')
    ->bind(':user', 'taylor')
    ->execute();

$rows = PDO::resultset();            // array|false — all rows
$row  = PDO::single();               // one row
$count = PDO::rowCount();            // affected rows
$id   = PDO::lastInsertId();         // last auto-increment id
```

Named connections:

```php
use Omega\Database\Facades\DB;

$mysql = DB::connection('mysql');     // lazy, cached per connection name
$sqlite = DB::connection('sqlite');

$result = $mysql->query('UPDATE users SET stat = stat + 1 WHERE user = :user')
    ->bind(':user', 'taylor')
    ->execute();

echo $mysql->rowCount();
```

Transactions:

```php
// Closure style — commits when the callable returns true, otherwise rolls back:
$ok = DB::transaction(function (): bool {
    DB::query('INSERT INTO orders (total) VALUES (:total)')->bind(':total', 100)->execute();
    DB::query('UPDATE wallet SET balance = balance - 100 WHERE id = 1')->execute();

    return true;   // commit
});

// Manual control:
DB::beginTransaction();
try {
    // ...statements...
    DB::endTransaction();        // commit
} catch (Throwable $e) {
    DB::cancelTransaction();     // rollback
    throw $e;
}
```

Logging:

```php
DB::flushLogs();          // reset the query log
$logs = DB::getLogs();    // [['query' => ..., 'started' => ..., 'ended' => ..., 'duration' => ...]]
```

## Query builder

Obtain a table builder from the default connection with `DB::table('users')`, or from
a custom connection with `DB::from('users', $connection)` (or
`Omega\Database\Query\Query::from('users', $pdo)`).

### Select

```php
$rows = DB::table('users')
    ->select(['user', 'stat'])
    ->equal('user', 'taylor')          // WHERE user = :bind
    ->compare('stat', '>', 1)          // WHERE stat > ...
    ->like('email', '%@omega.dev')
    ->in('role', ['admin', 'editor'])
    ->where('created_at > :created', [[':created', '2024-01-01']])
    ->between('stat', 0, 100)
    ->order('user')                    // Query::ORDER_ASC | ORDER_DESC
    ->limitOffset(10, 0)
    ->all();                           // array|false — full result set

// Alternatives for fetching:
$rowCollection = DB::table('users')->select()->equal('user', 'taylor')->get();    // Omega\Collection\Collection
$singleRow     = DB::table('users')->select()->equal('user', 'taylor')->single(); // array
```

Column order/grouping and sub-queries:

```php
use Omega\Database\Query\Query;

DB::table('users')->select()->order('user', Query::ORDER_DESC)->groupBy('role');

// Sub-query conditions (WHERE ... (SELECT ...)):
DB::table('orders')->select()
    ->whereCompare('user', '=', DB::table('users')->select(['user'])->equal('role', 'editor'));
```

Joins:

```php
use Omega\Database\Query\Join\InnerJoin;
use Omega\Database\Query\Join\LeftJoin;

$rows = DB::table('users')
    ->select(['users.user', 'profiles.name'])
    ->equal('users.user', 'taylor')
    ->join(InnerJoin::ref('profiles', 'user'))        // ON users.user = profiles.user
    ->join(LeftJoin::ref('orders', 'user'))
    ->all();
```

Available joins: `InnerJoin`, `LeftJoin`, `RightJoin`, `FullJoin`, `CrossJoin`.

### Insert / Replace

```php
DB::table('users')->insert()
    ->values(['user' => 'sony', 'password' => 'secret', 'stat' => 99])
    ->execute();

// Multi-row insert:
DB::table('users')->insert()
    ->rows([
        ['user' => 'a', 'password' => 'x', 'stat' => 1],
        ['user' => 'b', 'password' => 'y', 'stat' => 2],
    ])
    ->execute();

// MySQL upsert:
DB::table('users')->insert()
    ->values(['user' => 'sony', 'password' => 'new'])
    ->on('user')
    ->execute();

// REPLACE INTO:
DB::table('users')->replace()->values(['user' => 'sony', 'stat' => 50])->execute();
```

### Update / Delete

```php
DB::table('users')->update()
    ->values(['stat' => 1])
    ->equal('user', 'sony')
    ->execute();

DB::table('users')->delete()
    ->in('user', ['sony', 'nuno'])
    ->execute();
```

## Schema builder

```php
use Omega\Database\Schema\Table\Create;

// Migrations style:
Schema::table('users', function (Create $column) {
    $column('user')->varChar(32)->notNull();
    $column('password')->varChar(500);
    $column('stat')->int(3)->unsigned()->default(0);
    $column->primaryKey('user');
})->execute();
```

The blueprint callback receives a `Column`-like object; `$column('name')` builds a
column and you chain type + constraints:

- Types: `int($length)`, `tinyint`, `smallint`, `bigint`, `float`, `decimal($p,$s)`,
  `double`, `boolean`, `time`, `timestamp`, `date`, `datetime`, `year`, `char($len)`,
  `varChar($len)`, `text`, `blob`, `json`, `enum([...])`.
- Constraints: `notNull()`, `null()`, `default($value)`, `defaultNull()`,
  `autoIncrement()`, `unsigned()`, `comment($text)`, `raw($sql)`.
- Table options: `Schema::table(...)->engine(Create::INNODB)->character('utf8mb4')`.

Other schema operations:

```php
Schema::create()->database('blog')->ifNotExists()->execute();
Schema::drop()->table('users')->ifExists()->execute();      // also: drop()->database('blog')
Schema::refresh('users')->execute();                        // TRUNCATE TABLE
Schema::alter('users', function ($column) {
    $column->add('email')->varChar(100)->after('user');
    // $column->drop('deprecated_col');
    // $column->rename('old_name', 'new_name');
})->execute();
Schema::raw('ALTER TABLE ...')->execute();                  // arbitrary SQL
```

## Models

Models extend `Omega\Database\Model\Model`. There is no `$fillable`/`$timestamps`;
the protected configuration properties are `$tableName`, `$primaryKey` (default
`'id'`), `$stash` (columns hidden from output) and `$resistant` (columns that cannot
be modified).

```php
use Omega\Database\Model\Model;
use Omega\Database\Model\ModelCollection;

/**
 * @property string $user
 * @property int    $stat
 */
class User extends Model
{
    protected string $tableName  = 'users';
    protected string $primaryKey = 'user';
    protected array  $stash      = ['password'];   // hidden from output

    public function profile(): Profile
    {
        return $this->hasOne(Profile::class, 'user');
    }

    public function orders(): ModelCollection
    {
        return $this->hasMany(Order::class, 'user');
    }
}
```

Static finders (all need the connection):

```php
$pdo = PDO::getInstance();                 // or DB::connection('mysql')

$user = User::find('taylor', $pdo);                       // by primary key
$user = User::equal('user', 'taylor', $pdo);              // by column equality
$user = User::where('user = :user', ['user' => 'taylor'], $pdo);
$all  = User::all($pdo);                                  // ModelCollection
$user = User::findOrCreate('pradana', ['user' => 'pradana', 'stat' => 50], $pdo);
```

Instance CRUD:

```php
$user = new User($pdo, [['user' => 'nuno', 'stat' => 50]]);
$user->insert();

$user = new User($pdo, []);
$user->identifier()->equal('user', 'taylor');
$user->read();

$user->setter('stat', 75);      // or $user->stat = 75; / $user['stat'] = 75;
$user->update();

$user->delete();

$user->first();                 // first row as array
$user->get();                   // ModelCollection
$user->isDirty('stat');         // dirty-tracking helpers: isClean(), changes()
```

## Seeders

```php
use Omega\Database\Seeder\AbstractSeeder;

class UserSeeder extends AbstractSeeder
{
    public function run(): void
    {
        $this->create('users')
            ->values(['user' => 'admin', 'password' => 'secret'])
            ->execute();

        $this->call(ProfileSeeder::class);   // run another seeder with the same connection
    }
}
```

## Reference

- Entry points: `DatabaseManager.php`, `ConnectionFactory.php`, `AbstractConnection.php`
- Facades: `Facades/DB.php`, `Facades/PDO.php`, `Facades/Schema.php`
- Query builder: `Query/` (`Query`, `Table`, `Select`, `Insert`, `Replace`, `Update`,
  `Delete`, `Where`, `Join/`)
- Schema: `Schema/` (`Schema`, `Create`, `Drop`, `Table/`, `DB/`)
- Models: `Model/Model.php`, `Model/ModelCollection.php`
- Seeders: `Seeder/AbstractSeeder.php`
- Exception: `Exceptions/InvalidConfigurationException.php`
- License: GPL-3.0+