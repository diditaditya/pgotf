const express = require('express');
const bodyParser = require('body-parser');
const Sequelize = require('sequelize');

const sequelize = new Sequelize('mydb', 'didit', 'didit', {
    host: 'localhost',
    dialect: 'postgres'
});

sequelize.authenticate()
    .then(()=>console.log('connected to db..'))
    .catch(err=>console.log(err));

const User = sequelize.define('user', {
    username: Sequelize.STRING,
    password: Sequelize.STRING
});

const app = express();
app.use(bodyParser.urlencoded({ extended:false }));
app.use(bodyParser.json());

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

app.get('/', (req, res) => res.send('up and running..'));

// to check newly created tables
app.get('/tables', (req, res) => {
    sequelize.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'")
        .then(data=>res.json(data))
        .catch(err => {
            console.log(err);
            res.send(err);
        });
});

// select * from table
app.get('/:tableName', (req, res) => {
    let tableName = req.params.tableName;
    // model instatiaton should not be here,
    // better right after creating new table and store new model in some object
    sequelize.query(`SELECT column_name, data_type FROM information_schema.columns WHERE TABLE_NAME = '${tableName}'`)
        .then(data => {
            let model = generateModel(tableName, data[0]);
            model.findAll()
                .then(data => {
                    console.log(data);
                    res.send(data)
                })
                .catch(err => {
                    console.log(err);
                    res.send(err);
                });
        }).catch(err => {
            console.log(err);
            res.send(err);
        });
});

// insert into table
app.post('/:tableName', (req, res) => {
    let tableName = req.params.tableName;
    sequelize.query(`SELECT column_name, data_type FROM information_schema.columns WHERE TABLE_NAME = '${tableName}'`)
        .then(data => {
            let model = generateModel(tableName, data[0]);
            model.create(req.body)
                .then(data => {
                    console.log(data);
                    res.send(data)
                })
                .catch(err => {
                    console.log(err);
                    res.send(err);
                });
            // res.send(data);
        }).catch(err => {
            console.log(err);
            res.send(err);
        });
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

    let query = `CREATE TABLE ${tableName} (id SERIAL PRIMARY KEY, ${tableFields.join(', ')});`
    sequelize.query(query)
        .then(data=>res.json(data))
        .catch(err => {
            console.log(err);
            res.send(err);
        });
});

app.listen(3000, () => console.log('listening...'));