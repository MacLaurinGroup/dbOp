/**
 * Builder class
 *
 * (c) MacLaurin Group LLC 2018
 */
"use strict";

const _ = require("underscore");

class dbOp {

  constructor(_dbOpMysql) {
    this.dbOpMysql = _dbOpMysql;
    this.tables = {};
    this.selectSql = "";
    this.whereSql = "";
    this.fromSql = "FROM ";
    this.orderbySql = "";
    this.limitSql = "";
    this.values = [];
    this.dbConn = null;
    this.console = false;
  }

  /**
   * joinStruct is the { "<table>.<alias>.<column>" : "<table>.<alias>.<column>" } for defining the tables
   * and the way they are joined.  If it is a single table then pass in a string: "<table>.<alias>"
   */
  async init(dbConn, joinStruct) {
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
        this.fromSql += "`" + leftTable.name + "` " + leftTable.alias + ",";

      }

      if (right != null) {
        const rightTable = {
          alias: right[1],
          name: right[0],
          desc: await this.dbOpMysql._getTableDesc(dbConn, right[0])
        };
        if (!_.has(this.tables, rightTable.name)) {
          this.tables[rightTable.name] = rightTable;
          this.fromSql += "`" + rightTable.name + "` " + rightTable.alias + ",";
        }

        if (this.whereSql == "") {
          this.whereSql = " WHERE ";
        }

        this.whereSql += leftTable.alias + "." + left[2];
        this.whereSql += "=" + rightTable.alias + "." + right[2] + " AND ";
      }
    }

    if (this.whereSql.endsWith(" AND ")) {
      this.whereSql = this.whereSql.substring(0, this.whereSql.lastIndexOf(" AND"));
    }

    this.fromSql = this.fromSql.substring(0, this.fromSql.length - 1);
    return this;
  }


  selectAll() {
    for (let tableName in this.tables) {
      const table = this.tables[tableName];
      for (let column in table.desc.columns) {
        this.selectSql += table.alias + ".`" + column + "` as `" + table.alias + "_" + column + "`,";
      }
    }

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

  orderby(statement) {
    this.orderbySql = " ORDER BY " + statement;
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
  }

  orderbyReset() {
    this.orderbySql = "";
  }

  limitReset() {
    this.limitSql = "";
  }

  getSql() {
    if (this.selectSql == "") {
      this.selectAll();
    }

    return "SELECT " + this.selectSql + " " + this.fromSql + " " + this.whereSql + " " + this.orderbySql + " " + this.limitSql;
  }

  async run() {
    if (this.selectSql == "") {
      this.selectAll();
    }

    let sql = "SELECT " + this.selectSql + " " + this.fromSql + " " + this.whereSql + " " + this.orderbySql + " " + this.limitSql;

    if (this.console) {
      console.log(sql);
    }

    return await this.dbConn.query(sql, this.values);
  }

  async runFirstRow() {
    const rows = await this.run();
    return (rows.length == 1) ? rows[0] : null;
  }

  async count() {
    let sql = "SELECT count(*) as t " + this.fromSql + " " + this.whereSql;
    const row = await this.dbConn.query(sql, this.values);
    return (row == null || row.length == 0) ? 0 : row[0].t;
  }

  /**
   * For handling the DataTables
   * https://datatables.net/manual/server-side
   */
  applyFilterOrder(req) {
    return this.dataTableFilter(req);
  }

  dataTableFilter(req) {
    // Add in the search
    if (req.query.search) {
      const searchVal = req.query.search.value;
      if (searchVal.length > 2) {
        let where = " (";
        const whereVals = [];

        for (let col of req.query.columns) {
          if (col.searchable == "true") {
            where += this.transformColumn(col.data);
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
    }

    // Add in the order
    if (req.query.order && req.query.columns) {
      const colOrderIndex = req.query.order[0].column * 1;
      const colOrderName = req.query.columns[colOrderIndex].data;
      this.orderbySql = " ORDER BY " + colOrderName + " " + ((req.query.order[0].dir == "asc") ? "asc" : "desc");
    }

    // Do the limit
    if (req.query.start && req.query.length) {
      this.limitSql = " LIMIT " + req.query.start + "," + req.query.length;
    }

    return this;
  }

  transformColumn(colName) {
    let s = colName.indexOf("_");
    if (s >= 0) {
      return colName.substring(0, s) + "." + colName.substring(s + 1);
    } else {
      return colName;
    }
  }
}

module.exports = dbOp;
