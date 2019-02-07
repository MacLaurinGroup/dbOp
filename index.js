/**
 * Helper class that creates and validates database operations
 * https://github.com//MacLaurinGroup/dbOp
 * (c) MacLaurin Group LLC 2018
 */
"use strict";

const _ = require("underscore");
const dbOp = require("./dbOp");

class dbOpMysql {

  constructor() {
    this.tableDescCache = {};

    // These fields will be ignored if passed into the body
    this.controlFields = {
      "dtMod": true,
      "dtCreate": true,
      "rec_mod_dt": true,
      "rec_create_dt": true
    };

    this.lastResult = null;
  }


  clearCache(){
    this.tableDescCache = {};
    return this;
  }


  /**
   * Sanitize strings so they are clean
   */
  sanitizeFieldsAZaz09(data, fields) {
    for (let field of fields) {
      if (_.has(data, field)) {
        data[field] = data[field].trim();
        data[field] = data[field].replace(/[^a-zA-Z0-9]/g, '-');
      }
    }
    return this;
  }


  /**
   * Check for fields that present, but empty; Builder pattern
   */
  checkForEmptyFields(data, fields) {
    for (let field of fields) {
      if (_.has(data, field) && (data[field] == null || data[field] == "")) {
        throw new Error(field + " was empty");
      }
    }
    return this;
  }


  /**
   * Check for fields that missing
   */
  checkForMissingFields(data, fields) {
    for (let field of fields) {
      if (!_.has(data, field)) {
        throw new Error(field + " was missing");
      }
    }
    return this;
  }


  /**
   * Return back a builder object
   */
  async sqlBuilder(dbConn, tables) {
    const dop = new dbOp(this);
    return await dop.init(dbConn, tables);
  }


  /**
   * Performs a single select on a table; optional columnArray is the only columns you want back
   */
  async singleSelect(dbConn, table, data, columnArray) {
    return await this.selectOne(dbConn, table, data, columnArray);
  }

  async selectOne(dbConn, table, data, columnArray) {
    const tableDesc = await this._getTableDesc(dbConn, table);

    columnArray = (typeof columnArray != "undefined") ? columnArray : [];

    let sql = "SELECT ";
    const vals = [];
    for (let column in tableDesc.columns) {
      if (columnArray.length == 0 || (columnArray.length > 0 && _.indexOf(columnArray, column)) >= 0) {
        sql += "`" + column + "`,";
      }
    }
    sql = sql.substr(0, sql.length - 1);
    sql += " FROM `" + table + "` WHERE ";

    for (let pk of tableDesc.keys) {
      if (_.has(data, pk)) {
        sql += "`" + pk + "`=? AND ";
        vals.push(data[pk]);
      } else {
        throw new Error("[-] Missing primary key=" + pk);
      }
    }

    sql = sql.substring(0, sql.lastIndexOf("AND"));
    const rows = await dbConn.query(sql, vals);
    return (rows.length == 1) ? rows[0] : null;
  }

  async insert(dbConn, table, data, ignoreFlag) {
    const tableDesc = await this._getTableDesc(dbConn, table);
    this.validateData(tableDesc, data);

    ignoreFlag = (ignoreFlag) ? ignoreFlag : false;

    // Create the SQL statement
    let sql = "INSERT " + ((ignoreFlag) ? "IGNORE" : "");
    sql += " INTO `" + table + "` (";
    let sqlVals = ") VALUES (";
    const vals = [];

    // Put the names
    for (let key in data) {
      if (_.has(tableDesc.columns, key) && !tableDesc.columns[key].autoKeyGen && !_.has(this.controlFields, key)) {
        sql += "`" + key + "`,";
        sqlVals += "?,";
        vals.push(data[key]);
      }
    }
    sql = sql.substr(0, sql.length - 1);
    sqlVals = sqlVals.substr(0, sqlVals.length - 1);
    sql = sql + sqlVals + ")";

    // Execute the function
    this.lastResult = await dbConn.query(sql, vals);
    return _.has(this.lastResult, "insertId") ? this.lastResult.insertId : true;
  }


  /**
   * Returns the number of rows updated
   */
  async update(dbConn, table, data) {
    const tableDesc = await this._getTableDesc(dbConn, table);
    this.validateData(tableDesc, data);

    // Create the SQL statement
    let sql = "UPDATE `" + table + "` SET ";
    const vals = [];

    // Put the names
    for (let key in data) {
      if (_.has(tableDesc.columns, key) && !tableDesc.columns[key].autoKeyGen && !_.has(this.controlFields, key)) {
        if (tableDesc.columns[key].type.startsWith("date") && (data[key] == "now()" || data[key] == "NOW()")) {
          sql += "`" + key + "`=now(),";
        } else {
          sql += "`" + key + "`=?,";
          vals.push(data[key]);
        }
      }
    }
    sql = sql.substr(0, sql.length - 1);

    // Add the key
    sql += " WHERE ";
    for (let pk of tableDesc.keys) {
      if (tableDesc.columns[pk].keyType && tableDesc.columns[pk].keyType == "PRI") {
        if (_.has(data, pk)) {
          sql += "`" + pk + "`=? AND ";
          vals.push(data[pk]);
        } else {
          throw new Error("[-] Missing primary key=" + pk);
        }
      }
    }

    sql = sql.substring(0, sql.lastIndexOf("AND"));

    // Execute the function
    this.lastResult = await dbConn.query(sql, vals);
    return _.has(this.lastResult, "changedRows") ? this.lastResult.changedRows : 0;
  }


  getLastResult() {
    return this.lastResult;
  }


  //---[ Psuedo Private Methods ]-------------------------------------

  validateData(tableDesc, data) {
    let columnCount = 0;

    for (let fieldData in data) {
      if (_.has(tableDesc.columns, fieldData)) {
        const fieldDef = tableDesc.columns[fieldData];
        columnCount++;

        if (fieldDef.type == "text") {
          data[fieldData] = data[fieldData].trim();
        } else if (fieldDef.type == "varchar") {
          if (!_.isString(data[fieldData])) {
            data[fieldData] = data[fieldData] + "";
          }
          data[fieldData] = data[fieldData].trim();
          if (data[fieldData].length > fieldDef.len) {
            throw new Error("[-] Field=" + fieldData + "; longer than " + fieldDef.len);
          }
        } else if (fieldDef.type == "enum") {
          if (_.indexOf(fieldDef.values, data[fieldData]) == -1) {
            throw new Error("[-] Field=" + fieldData + "; invalid value=" + data[fieldData]);
          }
        } else if (fieldDef.type == "int" || fieldDef.type == "tinyint" || fieldDef.type == "smallint") {
          data[fieldData] = data[fieldData] * 1;
          if (_.isNaN(data[fieldData])) {
            throw new Error("[-] Field=" + fieldData + "; not a number");
          }
          const tmp = "" + data[fieldData];
          if (tmp.length > fieldDef.len) {
            throw new Error("[-] Field=" + fieldData + "; too big too store");
          }
        } else if (fieldDef.type == "date" && (data[fieldData] != "now()" && data[fieldData] != "NOW()")) { // yyyy-mm-dd

          if (data[fieldData] == "") {
            data[fieldData] = null;
          } else {
            const parts = data[fieldData].split("-");
            if (parts.length != 3) {
              throw new Error("[-] Field=" + fieldData + "; invalid date format (yyyy-mm-dd)");
            }
            data[fieldData] = this._getDate(fieldData, parts);
          }

        } else if (fieldDef.type == "datetime" && (data[fieldData] != "now()" && data[fieldData] != "NOW()")) { // yyyy-mm-dd hh:mm:ss

          if (data[fieldData] == "") {
            data[fieldData] = null;
          } else {
            const dateTime = data[fieldData].split(" ");
            if (dateTime.length != 2) {
              throw new Error("[-] Field=" + fieldData + "; invalid date format (yyyy-MM-dd hh:mm:ss)");
            }

            let parts = dateTime[0].split("-");
            if (parts.length != 3) {
              throw new Error("[-] Field=" + fieldData + "; invalid date format (yyyy-mm-dd)");
            }
            const date = this._getDate(fieldData, parts);

            parts = dateTime[1].split(":");
            if (parts.length != 3) {
              throw new Error("[-] Field=" + fieldData + "; invalid date format (hh:mm:ss)");
            }
            data[fieldData] = this._getTime(fieldData, date, parts);
          }
        }

      }
    }

    if (columnCount == 0) {
      throw new Error("[-] No valid columns supplied");
    }
  }


  /**
   * Parses the HH:MM:SS and validates
   */
  _getTime(fieldData, thisDate, parts) {
    let v = parts[0] * 1;
    if (_.isNaN(v) || v < 0 || v > 23) {
      throw new Error("[-] Field=" + fieldData + "; invalid hour=" + parts[0]);
    }
    thisDate.setHours(v);

    v = parts[1] * 1;
    if (_.isNaN(v) || v < 0 || v > 59) {
      throw new Error("[-] Field=" + fieldData + "; invalid minute=" + parts[1]);
    }
    thisDate.setMinutes(v);

    v = parts[2] * 1;
    if (_.isNaN(v) || v < 0 || v > 59) {
      throw new Error("[-] Field=" + fieldData + "; invalid seconds=" + parts[2]);
    }

    thisDate.setSeconds(v);
    return thisDate;
  }


  /**
   * Parses the yyy/m/d
   */
  _getDate(fieldData, parts) {
    const thisDate = new Date();
    thisDate.setHours(0);
    thisDate.setMinutes(0);
    thisDate.setSeconds(0);
    thisDate.setMilliseconds(0);

    let v = parts[0] * 1;
    if (_.isNaN(v) || v < 0 || v > 2100) {
      throw new Error("[-] Field=" + fieldData + "; invalid year=" + parts[0]);
    }
    thisDate.setFullYear(v);

    v = parts[1] * 1;
    if (_.isNaN(v) || v < 1 || v > 12) {
      throw new Error("[-] Field=" + fieldData + "; invalid month=" + parts[1]);
    }
    thisDate.setMonth(v - 1);

    v = parts[2] * 1;
    if (_.isNaN(v) || v < 0 || v > 31) {
      throw new Error("[-] Field=" + fieldData + "; invalid day=" + parts[2]);
    }

    thisDate.setDate(v);
    return thisDate;
  }


  /**
   * Retrieves the database desc of the table and pulls out the pieces we need
   */
  async _getTableDesc(dbConn, table) {
    if (_.has(this.tableDescCache, table)) {
      return this.tableDescCache[table];
    }

    try {
      const rows = await dbConn.query("desc `" + table + "`");
      const desc = {
        keys: [],
        columns: {}
      };

      for (let row of rows) {
        const field = {};
        field.type = row.Type;

        if (row.Key == "PRI" || row.Key == "MUL") {
          field.keyType = row.Key;
          if (row.Key == "PRI") {
            desc.keys.push(row.Field);
            if (row.Extra == "auto_increment") {
              field.autoKeyGen = true;
            }
          }
        }

        if (field.type.indexOf("(") > 0) {
          field.type = field.type.substring(0, field.type.indexOf("("));
          if (field.type == "enum") {
            field.values = row.Type.substring(row.Type.indexOf("(") + 1, row.Type.indexOf(")")).trim().replace(/'/g, "").split(",");
          } else if (field.type == "int" || field.type == "smallint" || field.type == "varchar" || field.type == "tinyint") {
            field.len = row.Type.substring(row.Type.indexOf("(") + 1, row.Type.indexOf(")")) * 1;
          }
        }

        desc.columns[row.Field] = field;
      }

      this.tableDescCache[table] = desc;
      return desc;
    } catch (e) {
      console.log(e);
      throw e;
    }
  }
}

module.exports = new dbOpMysql();
