/**
 * Builder class
 * https://github.com//MacLaurinGroup/dbOp
 * (c) MacLaurin Group LLC 2018
 */
"use strict";

const _ = require("underscore");
const moment = require("moment-timezone");

class dbOp {

  constructor(_dbOpMysql) {
    this.dbOpMysql = _dbOpMysql;
    this.tables = {};
    this.joinTables = [];
    this.fromTables = [];
    this.selectSql = "";
    this.whereSql = "";
    this.orderbySql = "";
    this.groupbySql = "";
    this.limitSql = "";
    this.values = [];
    this.dbConn = null;
    this.console = false;
    this.jsonColumnMap = null;
    this.rowFilterRemoveErantPeriod = false;
    this.rowFilterRemoveNullRow = false;
    this.tz = null;
  }



  /**
   * joinStruct is the { "<table>.<alias>.<column>" : "<table>.<alias>.<column>" } for defining the tables
   * and the way they are joined.  If it is a single table then pass in a string: "<table>.<alias>"
   */
  async init(dbConn, joinStruct, leftJoinStruct) {
    this.dbConn = dbConn;

    if (typeof joinStruct == "string") {
      const j = {};
      j[joinStruct] = null;
      joinStruct = j;
    }

    for (let t in joinStruct) {
      const left = t.split(".");
      let right = null;
      if (joinStruct[t] != null) {
        right = joinStruct[t].split(".");
      }

      const leftTable = {
        alias: left[1],
        name: left[0],
        desc: await this.dbOpMysql._getTableDesc(dbConn, left[0])
      };

      if (!_.has(this.tables, leftTable.name)) {
        this.tables[leftTable.name] = leftTable;

        this.fromTables.push({
          alias: leftTable.alias,
          from: "`" + leftTable.name + "` " + leftTable.alias,
          joins: []
        });

      }

      if (right != null) {
        const rightTable = {
          alias: right[1],
          name: right[0],
          desc: await this.dbOpMysql._getTableDesc(dbConn, right[0])
        };
        if (!_.has(this.tables, rightTable.name)) {
          this.tables[rightTable.name] = rightTable;

          this.fromTables.push({
            alias: rightTable.alias,
            from: "`" + rightTable.name + "` " + rightTable.alias,
            joins: []
          });

        }

        if (this.whereSql == "") {
          this.whereSql = " WHERE ";
        }

        this.whereSql += leftTable.alias + ".`" + left[2] + "`";
        this.whereSql += "=" + rightTable.alias + ".`" + right[2] + "` AND ";
      }
    }

    // Handle the left join
    if (typeof leftJoinStruct != "undefined") {

      for (let t in leftJoinStruct) {
        const left = t.split(".");

        const leftTable = {
          alias: left[1],
          name: left[0],
          desc: await this.dbOpMysql._getTableDesc(dbConn, left[0])
        };

        if (!_.has(this.tables, leftTable.name)) {
          this.tables[leftTable.name] = leftTable;
        }

        let right = null;
        let columns = null;
        if (leftJoinStruct[t] != null) {

          if (typeof leftJoinStruct[t] == "object") {
            right = leftJoinStruct[t]["join"].split(".");
            columns = leftJoinStruct[t]["columns"];
          } else {
            right = leftJoinStruct[t].split(".");
          }

          const rightTable = {
            alias: right[1],
            name: right[0],
            desc: await this.dbOpMysql._getTableDesc(dbConn, right[0])
          };

          // Has the specific columns been specified
          if (columns != null) {
            rightTable.columns = columns;
          }

          // Add this to our joined table list
          this.joinTables.push(rightTable);

          // Create the LEFT JOIN
          for (let t of this.fromTables) {
            if (t.alias == leftTable.alias) {
              t.joins.push(" LEFT JOIN " + rightTable.name + " " + rightTable.alias + " ON " + leftTable.alias + ".`" + left[2] + "` = " + rightTable.alias + ".`" + right[2] + "`");
              break;
            }
          }
        }
      }
    }

    if (this.whereSql.endsWith(" AND ")) {
      this.whereSql = this.whereSql.substring(0, this.whereSql.lastIndexOf(" AND"));
    }

    return this;
  }

  getFrom() {
    return this.fromTables;
  }

  setFrom(_fromTables) {
    this.fromTables = _fromTables;
  }

  setOptions(config) {
    this.jsonColumnMap = config.dataTableJsonColumnMap ? config.dataTableJsonColumnMap : null;
    this.rowFilterRemoveErantPeriod = config.rowFilterRemoveErantPeriod ? config.rowFilterRemoveErantPeriod : false;
    this.rowFilterRemoveNullRow = config.rowFilterRemoveNullRow ? config.rowFilterRemoveNullRow : false;
  }


  selectAll() {
    // Go through the core tables
    for (let tableName in this.tables) {
      const table = this.tables[tableName];
      for (let column in table.desc.columns) {
        this.selectSql += table.alias + ".`" + column + "`,";
      }
    }

    // Go through the joined tables
    for (let table of this.joinTables) {
      if (table.columns) {
        this.selectSql += table.columns + ",";
        continue;
      }
      for (let column in table.desc.columns) {
        this.selectSql += table.alias + ".`" + column + "`,";
      }
    }

    // Finally cleanup
    this.selectSql = this.selectSql.substring(0, this.selectSql.length - 1);
    return this;
  }

  select(statement) {
    this.selectSql = statement;
    return this;
  }

  /**
   * statement should be a legal SQL statement, with the alias and ? for the prepared statement;
   * can be called multiple times to build up the statement
   */
  where(statement, values) {
    if (this.whereSql.length == 0) {
      this.whereSql += "WHERE " + statement;
    } else {
      this.whereSql += " AND " + statement;
    }

    if (typeof values != "undefined") {
      this.values = this.values.concat(values);
    }

    return this;
  }

  whereOR(statement, values) {
    if (this.whereSql.length == 0) {
      this.whereSql += "WHERE " + statement;
    } else {
      this.whereSql += " OR " + statement;
    }

    if (typeof values != "undefined") {
      this.values = this.values.concat(values);
    }

    return this;
  }

  orderby(statement) {
    this.orderbySql = " ORDER BY " + statement;
    return this;
  }

  groupby(statement) {
    this.groupbySql = " GROUP BY " + statement;
    return this;
  }

  limit(page, pageSize) {
    this.limitSql = " LIMIT " + ((page) * pageSize) + "," + pageSize;
    return this;
  }

  setConsole(consoleFlag) {
    this.console = consoleFlag;
    return this;
  }

  whereReset() {
    this.whereSql = "";
    this.values = [];
    return this;
  }

  orderbyReset() {
    this.orderbySql = "";
    return this;
  }

  groupbyReset() {
    this.groupbySql = "";
    return this;
  }

  limitReset() {
    this.limitSql = "";
    return this;
  }

  toString() {
    return this.getSql();
  }

  getSql() {
    if (this.selectSql == "") {
      this.selectAll();
    }

    return "SELECT " + this.selectSql + " " + generateFromStatement(this.fromTables) + " " + this.whereSql + " " + this.groupbySql + " " + this.orderbySql + " " + this.limitSql;
  }

  async run() {
    if (this.selectSql == "") {
      this.selectAll();
    }

    const sql = "SELECT " + this.selectSql + " " + generateFromStatement(this.fromTables) + " " + this.whereSql + " " + this.groupbySql + " " + this.orderbySql + " " + this.limitSql;

    if (this.console) {
      console.log(sql);
    }

    return this.filterRows(await this.dbConn.query({
      sql: sql,
      nestTables: "."
    }, this.values));
  }

  async runFirstRow() {
    const rows = await this.run();
    return (rows.length == 1) ? rows[0] : null;
  }

  async count() {
    let sql;
    if (this.selectSql.toLowerCase().indexOf(" distinct ") != -1) {
      sql = "SELECT DISTINCT count(*) as t " + generateFromStatement(this.fromTables) + " " + this.whereSql;
    } else {
      sql = "SELECT count(*) as t " + generateFromStatement(this.fromTables) + " " + this.whereSql;
    }
    const row = await this.dbConn.query(sql, this.values);
    return (row == null || row.length == 0) ? 0 : row[0].t;
  }


  /**
   * Applies the clean up to the rows before it is sent back
   */
  filterRows(rows) {
    if ((this.rowFilterRemoveErantPeriod == false && this.rowFilterRemoveNullRow == false && this.tz == null) || rows.length == 0)
      return rows;

    for (const row of rows) {
      for (const col in row) {

        // Normalize the dates to the TZ
        if ( this.tz != null && row[col] != null && typeof row[col].getMonth === "function" ){
          row[col] = moment(moment(row[col]).tz(this.tz).format("YYYY-MM-DD HH:mm:ss")).toDate();
        }

        if (this.rowFilterRemoveNullRow && row[col] == null) {
          delete row[col];
          continue;
        }

        if (this.rowFilterRemoveErantPeriod && col.charAt(0) == '.') {
          row[col.substring(1)] = row[col];
          delete row[col];
        }
      }
    }
    return rows;
  }

  setTimeZoneEST(){
    this.setTimeZone("America/New_York");
  }

  setTimeZone(tz){
    this.tz = tz;
  }

  /**
   * For handling the DataTables
   * https://datatables.net/manual/server-side
   */
  applyFilterOrder(req) {
    return this.dataTableFilter(req);
  }

  dataTableFilter(req) {
    if (typeof req.query == "undefined")
      return;

    // AutoFilter; for fields that are part of the string
    const filteredColumns = {};

    for (let tableName in this.tables) {
      const table = this.tables[tableName];
      for (let column in table.desc.columns) {
        if (_.has(req.query, table.alias + "." + column)) {
          this.where(table.alias + ".`" + column + "` = ?", req.query[table.alias + "." + column]);
          filteredColumns[table.alias + "." + column] = true;
        } else if (_.has(req.query, column)) {
          this.where(table.alias + ".`" + column + "` = ?", req.query[column]);
          filteredColumns[table.alias + "." + column] = true;
        }
      }

      // Check to see if any of the query params are for this query for the custom JSon map
      if (this.jsonColumnMap == null)
        continue;

      for (let prefix in this.jsonColumnMap) {
        for (let queryParam in req.query) {
          if (queryParam.startsWith(table.alias + "." + prefix)) {
            this.where(table.alias + ".`" + this.jsonColumnMap[prefix] + "` -> \"$." + queryParam.substring(queryParam.indexOf(prefix) + prefix.length) + "\"=?", req.query[queryParam]);
            filteredColumns[queryParam] = true;
          }
        }
      }
    }

    // Add in the search
    if (req.query.search) {

      // Support the shorten version
      if (req.query.c)
        req.query.columns = req.query.c;

      const searchVal = req.query.search.value;
      if (searchVal.length > 2) {
        let where = " (";
        const whereVals = [];

        for (let col of req.query.columns) {
          if (col.searchable == "true" && !_.has(filteredColumns, col.data)) {
            const columnName = transformColumn(col.data);

            if (this.jsonColumnMap != null && columnName.indexOf(".") > 0) {
              const tableAlias = columnName.substring(0, columnName.indexOf("."));
              let bFound = false;
              for (let prefix in this.jsonColumnMap) {
                if (columnName.startsWith(tableAlias + "." + prefix)) {
                  where += tableAlias + ".`" + this.jsonColumnMap[prefix] + "` -> ";
                  where += "\"$." + columnName.substring(columnName.indexOf(prefix) + prefix.length) + "\"";
                  where += " LIKE ? OR ";
                  whereVals.push("%" + searchVal + "%");
                  bFound = true;
                  break;
                }
              }

              // If we added in this column we don't want to put it as part of the core search
              if (bFound)
                continue;
            }

            where += columnName;
            where += " LIKE ? OR ";
            whereVals.push("%" + searchVal + "%");
          }
        }

        where = where.substring(0, where.lastIndexOf("OR"));
        where += ") ";

        this.where(where, whereVals);
      }
    }

    // columns
    if (req.query.selectcolumns) {
      this.selectSql = req.query.selectcolumns;
    } else if (req.query && req.query.fields) {
      this.selectSql = req.query.fields;
    }

    // Add in the order
    if (req.query.order && req.query.columns) {
      const colOrderIndex = req.query.order[0].column * 1;
      const colOrderName = transformColumn(req.query.columns[colOrderIndex].data);
      this.orderbySql = " ORDER BY " + colOrderName + " " + ((req.query.order[0].dir == "asc") ? "asc" : "desc");
    }

    // Do the limit
    if (req.query.start && req.query.length) {
      this.limitSql = " LIMIT " + req.query.start + "," + req.query.length;
    }

    return this;
  }

  async dataTableExecute() {
    const result = {
      data: await this.run(),
      recordsTotal: await this.count()
    };
    result.recordsFiltered = result.recordsTotal;
    return result;
  }


}

module.exports = dbOp;


//------------------------------------------------------------
//- Suporting functions

function generateFromStatement(fromArray) {
  let fromSql = "FROM ";

  // Now we need to create the FROM SQL
  for (let t of fromArray) {
    fromSql += t.from;
    if (t.joins.length > 0) {
      fromSql += t.joins.join(" ");
    }
    fromSql += ",";
  }
  if (fromSql.endsWith(",")) {
    fromSql = fromSql.substring(0, fromSql.length - 1);
  }

  return fromSql;
}


function transformColumn(colName) {
  let s = colName.indexOf("\\");
  if (s >= 0) {
    colName = colName.substring(0, s) + colName.substring(s + 1);
  }
  return colName;
}
