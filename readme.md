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

A 4th optional field, ignore, will add in the IGNORE flag to the INSERT statement.

You can also psuedo name space the body, by passing in "alias.table" as the table defintion.  At this point, the fields will expect to see "alias.column1".

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

You can also psuedo name space the body, by passing in "alias.table" as the table defintion.  At this point, the fields will expect to see "alias.column1".

#### Helper Methods

There are a number of helper methods that are available to make data clean up simpler.

These methods are using the builder pattern:

* .setControlFields([])   // sets all the columns you wish to ignore in any UPDATE/INSERT statements
* .setDefaultOptions( {} )  // sets the default options for the SQL Config
* .clearCache()    // clears out the desc cache
* .sanitizeFieldsAZaz09(data,fieldArray)   // for the array of field names, clean up the data
* .checkForEmptyFields(data,fieldArray)   // throw an error if any of the fields are empty or null (after trimming whitespace)
* .checkForMissingFields(data,fieldArray)   // throw an error if any of the fields are missing
* .checkForMissingEmptyFields(data,fieldArray)   // throw an error if any of the fields are missing or empty
* .convertBlankToNull(data,fieldArray)  // converts any blank fields to pure null
* .execSqlFile( dbConn, filename, options )   // runs a file of SQL statements against the dbConn; options { delimiter : "" | "per-line"}

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
  "table1.t1.tableId": "table2.t2.tableId", {
    "table1.t1.rStatus" : "rStatus.rs.id",
    "table1.t1.rType" : {
      "join" : "rStatus.rs.id",
      "columns" : "rs.label"              // optional
  }
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

You can also specify some additional query params:

* columnName=value :: this will create a hard WHERE comparison and remove it from the dataTable search
* selectcolumns=col1,col2  :: returns back only the columns named

##### LEFT JOIN

The 3rd param makes it easier to create LEFT JOIN statements to join tables that may have null rows associated with them.  The syntax is an object with:

```
{
  "primaryTable.t1.tableId" : "joinedTable1.jt1.tableId"
}
```

The table you are joining to must be on the right hand side.  This will automatically select all the fields on the joinedTable and put them in the SELECT.  Alternatively you can specify which columns from the joinedTable you want:

```
{
  "primaryTable.t1.tableId" : {
    "join" : "joinedTable1.jt1.tableId",
    "columns" : "jt1.label"
}
```


#### Method list

* .selectAll()    // select all the columns
* .select( str )  // SELECT 'str' FROM
* .where( str[, val])  // adds a where statement with optional prepared value
* .whereOR( str[, val])  // adds a where statement with optional prepared value, appending as an OR
* .orderby( str )
* .groupby( str )
* .limit( page, pageSize )  // page No and pageSize
* .setConsole( true|false )  // outputs the final SQL to console.log()
* .whereReset()   // clears out the where
* .orderbyReset()  // clears out the orderby
* .groupbyReset()  // clears out the groupby
* .limitReset()   // clears out the limit
* .toString()     // gets the final SQL statement as a string
* .dataTableFilter(req)  // for dataTable support
* .dataTableExecute()   // executes the query, creating a struct that DataTable wants
* .setOptions( {} )  // See below
* .getFrom()     // Gets inner data object for all the tables in the FROM statement
* .setFrom([])   // Sets the inner data object; allowing to augment the tables
* .setTimeZoneEST() // Sets the Date columns to be adjusted ("America/New_York")
* .setTimeZone(tz) // Sets the tz; as per moments.js
* async .run()
* async .runFirstRow()
* async .count()

```
.setOptions({
  dataTableJsonColumnMap : {
    "__":"jsColumnName"       // for auto JSon search within a JSON type of field; co.__year will search for 'year' in the JSon column
  },
  "rowFilterRemoveErantPeriod" : true,   // Remove period in column name in the result that starts with .
  "rowFilterRemoveNullRow" : true,       // Remove any null values in the columns
})
```

## Updates

* 2020-04-03
  * Added timezone adjustment
* 2019-05-09
  * Added groupby()
* 2019-04-23
  * Added ability to process a file of SQL statements
* 2019-04-16
  * Removed console output
* 2019-04-12
  * Fixed null pointer with date
* 2019-04-08
  * Fixed the count() ignoring a 'distinct' in the SELECT
* 2019-03-30
  * Added in setOptions() for cleaning up rows
  * Added JSon searching in the dataTableFilter()
  * Added ability to add to the from table list
* 2019-03-28
  * Fixed bug with the order to which the LEFT JOIN is added into the SQL
* 2019-03-10
  * Allow null to be set for varchar/text fields
  * convertBlankToNull() helper method added
* 2019-03-02
  * Added LEFT JOIN to the sqlBuilder
  * Added checkForMissingEmptyFields() method to check for both
  * Added .whereOR()
  * Psuedo namespace on INSERT/UPDATE methods
  * Fixed sanitizeFieldsAZaz09() to allow space
* 2019-02-28
  * Removed the auto munging of columns from "." to "_"
  * Updated .dataTableExecute() to cope with "." aliases
  * Updated .dataTableExecute() to look for hard columns to filter on
* 2019-02-11 Updated added .dataTableExecute()
* 2019-02-07 Initial Release
