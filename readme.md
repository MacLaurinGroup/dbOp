## dbOp

A utility function to help with query writing for dealing with MySQL compatible databases.

It uses the meta-data from the database table (desc table) to automatically determine the proper checking and required fields when performing a SELECT, INSERT or UPDATE.   If you are performing lots of simple CRUD statements, without any fancy MySQL functions this utility helps a lot.  This data is cached, so repeated calls to 'desc' is not incurred.

The utility was also written to support the widely popular DataTables (https://datatables.net/) Javascript control, making it very easy to support
all the query params for sorting, searching and querying, with little to no effort.

The library can be used in two different modes:

1. Single use statements
2. Custom query builder for complex statements

Any errors result in exceptions being thrown.

## Installation

```
npm install mg-dbop
```

### Single use statements

#### SELECT

First example, pulls back a single row from the given table, with the given primary key fields passed in.

It returns null if no rows were found.

```
const dbOpMySql = require("mg-dbop");

const dbConn = //get a connection to MySQL database
const customId = "xxx";

const row = await dbOpMySql.selectOne(
  dbConn,
  "table1", {
    "tableId": customId
  },
  [
    "column1", "column2"
  ]
  );
```

Second example, without any columns specified, will return everything.

```
const dbOpMySql = require("mg-dbop");

const dbConn = //get a connection to MySQL database
const customId = "xxx";

const row = await dbOpMySql.selectOne(
  dbConn,
  "table1", {
    "tableId": customId,
    "tableSecId" : 321
  }
  );
```

#### INSERT

This will automatically look for the primary key values and construct the insert accordingly, making sure all required
fields are passed in.

```
const dbOpMySql = require("mg-dbop");

const dbConn = //get a connection to MySQL database

const data = {
  field : data,
  field2 : data,

  primaryKey : pkData
};

await dbOpMySql.insert(dbConn, "table", data);
```

It will return the ```lastInsertId``` of the last insert.   Alternatively you can always call ```dbOpMySql.getLastResult()``` for the actual object returned from MySql.

For fields that are designated datetime & date you can pass in the values now()/NOW() for the database to use the current time.

#### UPDATE

This will automatically look for the primary key values and construct the update accordingly, making sure all required
fields are passed in.

```
const dbOpMySql = require("mg-dbop");

const dbConn = //get a connection to MySQL database

const data = {
  field : data,
  field2 : data,

  primaryKey : pkData
};

await dbOpMySql.update(dbConn, "table", data);
```

This will return the number of rows that were up changed in this update.

#### Helper Methods

There are a number of helper methods that are available to make data clean up simpler.

These methods are using the builder pattern:

* .clearCache()    // clears out the desc cache
* .sanitizeFieldsAZaz09(data,fieldArray)   // for the array of field names, clean up the data
* .checkForEmptyFields(data,fieldArray)   // throw an error if any of the fields are empty or null (after trimming whitespace)
* .checkForMissingFields(data,fieldArray)   // throw an error if any of the fields are missing

This method returns the last SQL result from an INSERT/UPDATE

* .getLastResult()


### Custom Query Builder

This way works in the same way, using the database metadata contained within 'desc table' to drive a lot of the logic and query building.

The format is ```{ "<table>.<alias>.<column>" : "<table>.<alias>.<column>" }``` for defining the tables and the way they are joined.  If it is a single table then pass in a string: ```"<table>.<alias>"```

```
const dbOpMySql = require("mg-dbop");

const dbConn = //get a connection to MySQL database

// Create SQL Builder, tying together all the tables we want to join
// ""
const sql = await dbOpMySql.sqlBuilder(dbConn, {
  "table1.t1.tableId": "table2.t2.tableId"
});
```

Next there is a series of methods you can call on the object to create the string

```
sql.select("t1.tableName")
  .where("tableId=?", someValue2)
  .where("AND enabled=1")
  .where("AND dtMod > ?", someValue2)
  .orderby("tableId desc")
  .limit(0,10);
```

Once it is built you can then execute it:

```
const results = await sql.run();
const countV = await sql.count();
const firstRow = await sql.runFirstRow();
```

#### DataTable support

Datatables have a rich array of options associated with it.  dbOpMySql makes it easy to integrate.

```
const sql = await dbOpMySql.sqlBuilder(dbConn, {
  "table1.t1.tableId": "table2.t2.tableId"
});


// passing in the object where all the query params exist
sql.dataTableFilter( req );

// add in optional .where() statements you may wish; or .select() columns

// format the result as to what dataTables expect
const result = {
  data: await sql.run(),
  recordsTotal: await sql.count(),
}
```

#### Method list

* .selectAll()    // select all the columns
* .select( str )  // SELECT 'str' FROM
* .where( str[, val])  // adds a where statement with optional prepared value
* .orderby( str )
* .limit( page, pageSize )  // page No and pageSize
* .setConsole( true|false )  // outputs the final SQL to console.log()
* .whereReset()   // clears out the where
* .orderbyReset()  // clears out the orderby
* .limitReset()   // clears out the limit
* .getSql()       // gets the final SQL statement as a string
* .dataTableFilter(req)  // for dataTable support
* .dataTableExecute()   // executes the query, creating a struct that DataTable wants
* async .run()
* async .runFirstRow()
* async .count()


## Updates

* 2019-02-11 Updated added .dataTableExecute()
* 2019-02-07 Initial Release
