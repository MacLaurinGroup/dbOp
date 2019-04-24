/**
 * Class to handle
 *
 * (c) MacLaurin Group 2019
 */
"use strict";

const fs = require("fs");
const readline = require("readline");
const Mustache = require("mustache");

class classSQLFileRunner {

  constructor(_dbConn, _options) {
    this.dbConn = _dbConn;
    this.options = (typeof _options != "undefined") ? _options : {};
    this.delimiter = (typeof this.options.delimiter != "undefined") ? this.options.delimiter : "";
    delete this.options.delimiter;
  }

  async doFile(filename) {
    const classThis = this;

    const promise = new Promise(function(resolve, reject) {
      const rl = readline.createInterface({
        input: fs.createReadStream(filename),
        terminal: false
      });

      const statements = [];
      let stmtBlock = "";

      rl.on("line", function(chunk) {
        let line = chunk.toString("ascii").trim();
        if ( line.length == 0 || line.startsWith("//") )
          return;

        if (classThis.delimiter == "per-line") {
          statements.push(line);
        } else {
          if (line.endsWith(classThis.delimiter) || classThis.delimiter.length == 0) {
            stmtBlock += line + "\r\n";
            statements.push(stmtBlock);
            stmtBlock = "";
          } else {
            stmtBlock += line + "\r\n";
          }
        };
      });

      rl.on("close", function() {
        if ( stmtBlock.length > 0 )
          statements.push(stmtBlock);

        resolve(statements);
      });

    });

    let stArray;
    await promise.then((statements) => {
      stArray = statements;
    });


    // Run around the statements and execute
    for (let stmt of stArray)
      await this.__executeStatement(stmt);
  }


  async __executeStatement(stmt) {
    if (stmt.trim() == "")
      return;

    if ( Object.keys(this.options).length > 0 )
        stmt = Mustache.render( stmt, this.options );

    await this.dbConn.query(stmt);
  }
};

module.exports = classSQLFileRunner;
