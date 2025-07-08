const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const port = process.env.PORT || 5000;


app.get('/', (req, res) => {
    res.send('the last dance')
})

app.listen(port, () => {
    console.log(`server is running on port ${port}`)
})