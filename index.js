/**
 * Helper class that creates and validates database operations
 * https://github.com//MacLaurinGroup/dbOp
 * (c) MacLaurin Group LLC 2018, 2019
 */
"use strict";

const _ = require("underscore");
const dbOp = require("./dbOp");

class dbOpMysql {

  constructor() {
    this.tableDescCache = {};
    this.defaultOptions = null;

    // These fields will be ignored if passed into the body
    this.controlFields = {
      "dtMod": true,
      "dtCreate": true,
      "rec_mod_dt": true,
      "rec_create_dt": true
    };

    this.lastResult = null;
  }

  clearCache() {
    this.tableDescCache = {};
    return this;
  }

  setControlFields(cF){
    this.controlFields = cF;
    return this;
  }

  setDefaultOptions(config) {
    this.defaultOptions = config;
  }

  /**
   * For fields that need a null instead of "" are converted here; usually for the references
   */
  convertBlankToNull( data, fieldArr ){
    for ( let field of fieldArr ){
      field = field.trim();
      if ( _.has(data, field) && data[field] != null && data[field].trim() == "" ){
        data[field] = null;
      }
    }
    return this;
  }


  /**  ------------------------------------------------------------------------------------------
   * Sanitize strings so they are clean
   */
  sanitizeFieldsAZaz09(data, fields) {
    for (let field of fields) {
      if (_.has(data, field)) {
        data[field] = data[field].trim();
        data[field] = data[field].replace(/[^a-zA-Z0-9 ]/g, '-');
      }
    }
    return this;
  }


  /**  ------------------------------------------------------------------------------------------
   * Check for fields that missing and empty
   */
  checkForMissingEmptyFields(data, fields) {
    for (let field of fields) {
      if (!_.has(data, field)) {
        throw new Error(field + " was missing");
      } else if (data[field] == null || data[field].trim() == "") {
        throw new Error(field + " was empty");
      }
    }
    return this;
  }



  /**  ------------------------------------------------------------------------------------------
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



  /** ------------------------------------------------------------------------------------------
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



  /** ------------------------------------------------------------------------------------------
   * Return back a builder object
   */
  async sqlBuilder(dbConn, tables, leftJoinStruct) {
    const dop = new dbOp(this);

    if (this.defaultOptions != null)
      dop.setOptions(this.defaultOptions);

    return await dop.init(dbConn, tables, leftJoinStruct);
  }



  /** ------------------------------------------------------------------------------------------
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



  /** ------------------------------------------------------------------------------------------
   Performs an UPDATE statement on the 'table' with the given 'data' body.

   'table' can be a format of 'alias'.'table' and the alias is scoped inside of body.

   for example  "ac.table" ... would expect columns for table to be named "ac.column1" etc
   */

  async insert(dbConn, table, data, ignoreFlag) {
    // Pull out the table definitions
    const tableDef = table.split(".");
    const alias = (tableDef.length == 2) ? (tableDef[0]+".") : "";
    table = (tableDef.length == 1) ? tableDef[0] : tableDef[1];
    const tableDesc = await this._getTableDesc(dbConn, table);
    this.validateData(tableDesc, alias, data);

    ignoreFlag = (ignoreFlag) ? ignoreFlag : false;

    // Create the SQL statement
    let sql = "INSERT " + ((ignoreFlag) ? "IGNORE" : "");
    sql += " INTO `" + table + "` (";
    let sqlVals = ") VALUES (";
    const vals = [];

    // Put the names
    for (let key in data) {
      let tableKey = key.substring( alias.length );

      if (_.has(tableDesc.columns, tableKey) && !tableDesc.columns[tableKey].autoKeyGen && !_.has(this.controlFields, tableKey)) {
        sql += "`" + tableKey + "`,";
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


  /** ------------------------------------------------------------------------------------------
   Performs an UPDATE statement on the 'table' with the given 'data' body.

   'table' can be a format of 'alias'.'table' and the alias is scoped inside of body.

   for example  "ac.table" ... would expect columns for table to be named "ac.column1" etc
   */
  async update(dbConn, table, data) {

    // Pull out the table definitions
    const tableDef = table.split(".");
    const alias = (tableDef.length == 2) ? (tableDef[0]+".") : "";
    table = (tableDef.length == 1) ? tableDef[0] : tableDef[1];
    const tableDesc = await this._getTableDesc(dbConn, table);
    this.validateData(tableDesc, alias, data);

    // Create the SQL statement
    let sql = "UPDATE `" + table + "` SET ";
    const vals = [];

    // Put the names
    for (let key in data) {
      let tableKey = key.substring( alias.length );

      if (_.has(tableDesc.columns, tableKey) && !tableDesc.columns[tableKey].autoKeyGen && !_.has(this.controlFields, tableKey)) {
        if (tableDesc.columns[tableKey].type.startsWith("date") && (data[key] == "now()" || data[key] == "NOW()")) {
          sql += "`" + tableKey + "`=now(),";
        } else {
          sql += "`" + tableKey + "`=?,";
          vals.push(data[key]);
        }
      }
    }
    sql = sql.substr(0, sql.length - 1);

    // Add the key
    sql += " WHERE ";
    for (let pk of tableDesc.keys) {
      if (tableDesc.columns[pk].keyType && tableDesc.columns[pk].keyType == "PRI") {
        if (_.has(data, alias + pk)) {
          sql += "`" + pk + "`=? AND ";
          vals.push(data[alias + pk]);
        } else {
          throw new Error("[-] Missing primary key=" + alias + pk);
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

  validateData(tableDesc, alias, data) {
    let columnCount = 0;

    for (let fieldData in data) {
      let tableKey = fieldData.substring( alias.length );

      if (_.has(tableDesc.columns, tableKey)) {
        const fieldDef = tableDesc.columns[tableKey];
        columnCount++;

        if (fieldDef.type == "text") {

          if ( !fieldDef.allowNull && data[fieldData] == null )
            throw new Error("[-] Field=" + fieldData + "; value was null; not permitted" );

          data[fieldData] = ( data[fieldData] == null ) ?  null : data[fieldData].trim();

        } else if (fieldDef.type == "varchar") {

          if ( !fieldDef.allowNull && data[fieldData] == null )
            throw new Error("[-] Field=" + fieldData + "; value was null; not permitted" );

          if (data[fieldData] != null && !_.isString(data[fieldData])) {
            data[fieldData] = data[fieldData] + "";
          }

          data[fieldData] = ( data[fieldData] == null ) ?  null : data[fieldData].trim();

          if ( data[fieldData] != null && data[fieldData].length > fieldDef.len) {
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

          if (data[fieldData] == null || data[fieldData] == "") {
            data[fieldData] = null;
          } else if ( typeof data[fieldData].getMonth === 'function' ){
            // this is a date object so we don't need to worry
          } else {
            const parts = data[fieldData].split("-");
            if (parts.length != 3) {
              throw new Error("[-] Field=" + fieldData + "; invalid date format (yyyy-mm-dd)");
            }
            data[fieldData] = this._getDate(fieldData, parts);
          }

        } else if (fieldDef.type == "datetime" && (data[fieldData] != "now()" && data[fieldData] != "NOW()")) { // yyyy-mm-dd hh:mm:ss

          if (data[fieldData] == null || data[fieldData] == "") {
            data[fieldData] = null;
          } else if ( typeof data[fieldData].getMonth === 'function' ){
            // this is a date object so we don't need to worry
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

        field.allowNull = ( row["Null"] == "YES" );

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
