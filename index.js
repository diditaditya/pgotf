const express = require('express');
const bodyParser = require('body-parser');
const Sequelize = require('sequelize');
require('dotenv').config();

// instantiate sequelize
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'postgres'
});

// test db connection
sequelize.authenticate()
    .then(()=>console.log('connected to db..'))
    .catch(err=>console.log(err));

// initialize app and its setting
const app = express();
app.use(bodyParser.urlencoded({ extended:false }));
app.use(bodyParser.json());

// variable to store the models
let models = {}

// map the postgres data types to sequelize data types
const typeMapper = {
    'integer': 'INTEGER',
    'timestamp': 'DATE',
    'timestamp with time zone': 'DATE',
    'text': 'TEXT'
}

// function to generate model
const generateModel = (tableName, columns) => {
    let fields = {}
    columns.map(col => {
        if (col.column_name === 'id') {
            fields.id = { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true }
        } else if (col.column_name === 'createdat'){
            fields.createdAt = { type: Sequelize.DATE, field: 'createdat' }
        } else if (col.column_name === 'updatedat') {
            fields.updatedAt = { type: Sequelize.DATE, field: 'updatedat' }
        } else  {
            fields[col.column_name] = Sequelize[typeMapper[col.data_type]];
        }
    }, { timestamp: true });
    return sequelize.define(tableName, fields);
}

// function to get table columns and then generate the model
const modelize = (tableName) => {
    let query = `SELECT column_name, data_type FROM information_schema.columns WHERE TABLE_NAME = '${tableName}'`;
    return new Promise((resolve, reject) => {
        sequelize.query(query)
        .then(data => {
            let model = generateModel(tableName, data[0]);
            return resolve(model);
        })
        .catch(err => {
            console.log(err);
            return reject(err);
        });
    });
}

// modelize all tables found in db
const initModels = async (models) => {
    let query = "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'";
    let tables = [];
    try {
        let found = await sequelize.query(query);
        tables = found[0];
    } catch (err) {
        console.log(err);
    }
    for (let table of tables) {
        let newModel = null;
        try {
            newModel = await modelize(table.tablename);
        } catch (err) {
            console.log(err);
            return err;
        }
        if (newModel !== null) {
            models[table.tablename] = newModel;
        }
    }
    console.log('done populating models');
}

// init the app by populating the models with the existing tables
// better to use some checking mechanism, quit the app when error populating the models
initModels(models);

// routes
app.get('/', (req, res) => res.send('up and running..'));

// to check tables
app.get('/tables', (req, res) => {
    sequelize.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'")
        .then(data=>res.json(data[0]))
        .catch(err => {
            console.log(err);
            res.send(err);
        });
});

// select * from table
app.get('/get/:tableName', (req, res) => {
    let tableName = req.params.tableName;
    if (models[tableName]) {
        let model = models[tableName];
        model.findAll()
            .then(data => {
                res.status(200).send(data);
            })
            .catch(err => {
                console.log(err);
                res.send(err);
            });
    } else {
        res.status(404).send(`${tableName} not found`);
    }
});

// insert into table
app.post('/insert/:tableName', (req, res) => {
    let tableName = req.params.tableName;
    if (models[tableName]) {
        let model = models[tableName];
        model.create(req.body)
            .then(data => {
                res.status(200).send(data);
            })
            .catch(err => {
                console.log(err);
                res.send(err);
            });
    } else {
        res.status(400).send(`${tableName} not found`);
    }
});

// create new table
app.post('/table', (req, res) => {
    let tableName = req.body.tableName;
    let dtypes = req.body.dtypes;
    let fields = Object.keys(dtypes);
    let tableFields = fields.map(field => {
        return `${field} ${dtypes[field].toUpperCase()}`
    });
    tableFields.push('createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
    tableFields.push('updatedAt TIMESTAMP WITH TIME ZONE');

    let query = `CREATE TABLE ${tableName} (id SERIAL PRIMARY KEY, ${tableFields.join(', ')});`;
    sequelize.query(query)
        .then(data => {
            modelize(tableName)
                .then(newModel => {
                    models[tableName] = newModel;
                    console.log(models);
                    res.status(200).send(data);
                })
                .catch(err => {
                    console.log(err);
                    return err;
                });
        })
        .catch(err => {
            console.log(err);
            res.send(err);
        });
});

let port = process.env.PORT || 3000;
app.listen(port, () => console.log(`listening to port ${port}...`));