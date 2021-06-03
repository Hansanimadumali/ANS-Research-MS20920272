const express = require('express');
const exphbs = require('express-handlebars');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const fs = require('fs');
const mqtt = require('mqtt');
const https = require('http');
const cors = require("cors");
const axios = require('axios');
const querystring = require('querystring');
// var sensorLib = require("node-dht-sensor");

const crypto = require('crypto');
const { url } = require('inspector');
const app = express();
const authTokens = {};
var settings = {};

const sensor = {
    type: 11,
    pin: 17
};

const allowedOrigins = ["http://localhost:3000", "http://localhost:8080"];

// generate hashed password
const getHashedPassword = (password) => {
    const sha256 = crypto.createHash('sha256');
    const hash = sha256.update(password).digest('base64');
    return hash;
}


// generate a auth token
const generateAuthToken = () => {
    return crypto.randomBytes(30).toString('hex');
}


// read settings
const readSettingsJson = () => {
    let changeSettingsStr = fs.readFileSync('config/config.json');
    let changedSettings = JSON.parse(changeSettingsStr);

    if ('user' in changedSettings) {
        settings = changedSettings;
    } else {
        let originalSettingsStr = fs.readFileSync('config/config-orig.json');
        settings = JSON.parse(originalSettingsStr);
    }
}

// write updated settings to file
const updateSettingsJson = () => {
    let settingsString = JSON.stringify(settings);
    fs.writeFileSync('config/config.json', settingsString);
}


// resotre the original settings
const restoreSettings = () => {
    let originalSettingsStr = fs.readFileSync('config/config-orig.json');
    settings = JSON.parse(originalSettingsStr);

    fs.writeFileSync('config/config.json', "{}");
}


// To support URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

// To parse cookies from the HTTP Request
app.use(cookieParser());

app.use((req, res, next) => {
    const authToken = req.cookies['AuthToken'];
    req.user = authTokens[authToken];

    next();
});

app.use(
    cors({
        "origin": "*",
        //	function(origin, callback) {
        //            if (!origin) return callback(null, true);
        //            if (allowedOrigins.indexOf(origin) === -1) {
        //                var msg =
        //                    "The CORS policy for this site does not " +
        //                    "allow access from the specified Origin.";
        //                return callback(new Error(msg), false);
        //            }
        //            return callback(null, true);
        //        },
        "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
        "preflightContinue": false,
        "optionsSuccessStatus": 204
    })
);

app.engine('hbs', exphbs({
    extname: '.hbs'
}));

app.set('view engine', 'hbs');

//////////////////////////////////////////////////////////////////////
/// Controllers
//////////////////////////////////////////////////////////////////////

// Our requests hadlers will be implemented here...
app.get('/', function (req, res) {
    res.render('home');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = getHashedPassword(password);

    let user = undefined;

    if (settings.user.username === email && hashedPassword === settings.user.password) {
        user = settings.user;
    }

    if (user) {
        const authToken = generateAuthToken();

        authTokens[authToken] = email;

        res.cookie('AuthToken', authToken);
        res.redirect('/protected');
        return;
    } else {
        res.render('login', {
            message: 'Invalid username or password',
            messageClass: 'alert-danger'
        });
    }
});


app.get('/protected', (req, res) => {
    if (req.user) {
        res.render('protected', {
            settings: settings
        });
    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger'
        });
    }
});


app.get('/logout', (req, res) => {
    if (req.user) {
        res.cookie('AuthToken', "");
        res.redirect("/login");

    }
})

app.post('/user/update', (req, res) => {
    if (req.user) {
        const { password } = req.body;

        if (password == "") {
            res.render('protected', {
                message: 'Invalid Password',
                messageClass: 'alert-danger',
                settings: settings
            });

        } else {
            settings = { ...settings, user: { ...settings.user, password: getHashedPassword(password) } };
            updateSettingsJson();
            res.render('protected', {
                message: 'Successfully updated hub details',
                messageClass: 'alert-success',
                settings: settings
            });
        }
    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger',
        });
    }
});

app.post('/hub/update', (req, res) => {
    if (req.user) {
        const { hub_ip, hub_port, client_id, client_secret, auth_user, auth_password } = req.body;
        settings = {
            ...settings,
            hub: {
                ...settings.hub,
                // access_token:access_token,
                hub_ip: hub_ip,
                hub_port: hub_port,
                client_id: client_id,
                client_secret: client_secret,
                auth_user: auth_user,
                auth_password: auth_password
            }
        }

        updateSettingsJson();
        res.render('protected', {
            message: 'Successfully updated hub details',
            messageClass: 'alert-success',
            settings: settings
        });
    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger'
        });
    }
});

app.get('/hub/update/token', (req, res) => {
    if (req.user) {
        updateAuthToken2(res);

    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger'
        });
    }
});

app.get('/hub/delete/token', (req, res) => {
    if (req.user) {
        settings = {
            ...settings,
            hub: {
                ...settings.hub,
                access_token: ""
            }

        }
        updateSettingsJson();
        res.render('protected', {
            message: 'Successfully updated token',
            messageClass: 'alert-success',
            settings: settings
        });
    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger'
        });
    }
})

app.post('/mqtt/update', (req, res) => {
    if (req.user) {
        const { topic, username, password } = req.body;
        settings = {
            ...settings,
            mqtt: {
                ...settings.mqtt,
                topic: topic,
                username: username,
                password: password
            }
        }

        updateSettingsJson();
        res.render('protected', {
            message: 'Successfully updated hub details',
            messageClass: 'alert-success',
            settings: settings
        });
    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger'
        });
    }
});


app.post('/device/update', (req, res) => {
    if (req.user) {
        const { device_id } = req.body;
        settings = {
            ...settings,
            device_id: device_id
        }

        updateSettingsJson();
        res.render('protected', {
            message: 'Successfully updated hub details',
            messageClass: 'alert-success',
            settings: settings
        });
    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger'
        });
    }
});

app.get('/restore', (req, res) => {
    if (req.user) {
        restoreSettings();
        res.redirect("/login");
    } else {
        res.render('login', {
            message: 'Please login to continue',
            messageClass: 'alert-danger'
        });
    }
})


// READ settings

readSettingsJson();


///////////////////////////////////////////////////////////////////////
///// MQTT
///////////////////////////////////////////////////////////////////////


function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

// function readSensorData() {
//     // https://www.npmjs.com/package/node-dht-sensor
//     var readout = sensorLib.read(
//         sensor.type,
//         sensor.pin
//     );

//     return readout;
// }

function publish_temp(mqttClient, accessToken, topic) {
    let temp = parseInt(getRandomArbitrary(200, 300)) / 10;
    // let readOutValue = readSensorData();
    // let temp = readOutValue.temperature.toFixed(1);
    // let humid = readOutValue.humidity.toFixed(1);
    let humid = parseInt(getRandomArbitrary(200, 300)) / 10;


    tempObj = {
        payload: {
            temperature: temp,
            humidity: humid
        },
        authToken: accessToken
    };

    mqttClient.publish(topic, JSON.stringify(tempObj));
}

options = {
    cliendId: settings.device_id,
    username: settings.mqtt.username,
    password: settings.mqtt.password,
}
console.log(options)
let mqttClient = mqtt.connect('mqtt://' + settings.hub.hub_ip, options)

mqttClient.on('connect', function (err) {
    console.log("Connected to broker");

    setInterval(() => {
        publish_temp(mqttClient, settings.hub.access_token, settings.mqtt.topic);
    }, 2000);

})

///////////////////////////////////////////////////////////////////////
///// Auth tokens
///////////////////////////////////////////////////////////////////////

function updateAuthToken(response) {
    let form = {
        client_id: settings.hub.client_id,
        client_secret: settings.hub.client_secret,
        grant_type: "password",
        scope: "openid",
        username: settings.hub.auth_user,
        password: settings.hub.auth_password
    }

    console.log(form);

    let options = {
        // host: settings.hub.hub_ip,
        host: "localhost",
        port: 8080,
        // headers: {
        //     'Content-Type': 'application/x-www-form-urlencoded',
        //   },
        // path: "/auth/realms/demo-realm/protocol/openid-connect/token",
        path: "/auth/",
        method: "GET",
        // form: form
    }


    try {
        https.request(options, function (err, res, success) {
            updateSettingsJson();
            console.log("hello");
            response.render('protected', {
                message: 'Successfully updated token',
                messageClass: 'alert-success',
                settings: settings
            });
        });
    } catch (e) {
        console.log(e);
    }

}


function updateAuthToken2(response) {
    const form = {
        client_id: settings.hub.client_id,
        client_secret: settings.hub.client_secret,
        grant_type: "password",
        scope: "openid",
        username: settings.hub.auth_user,
        password: settings.hub.auth_password
    }
    const configSend = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }

    axios.post(
        "http://" + settings.hub.hub_ip + ":8080/auth/realms/demo-realm/protocol/openid-connect/token",
        querystring.stringify(form),
        configSend
    )
        .then(res => {
            let accessToken = res.data.access_token;

            console.log(accessToken);
            settings = {
                ...settings,
                hub: {
                    ...settings.hub,
                    access_token: accessToken
                }

            }
            updateSettingsJson();
            response.render('protected', {
                message: 'Successfully updated token',
                messageClass: 'alert-success',
                settings: settings
            });
        })
        .catch(err => {
            console.log(err);
            response.render('protected', {
                message: 'Failed to update token',
                messageClass: 'alert-danger',
                settings: settings
            });
        })
}


///////////////////////////////////////////////////////////////////////
///// Initiate Server
///////////////////////////////////////////////////////////////////////


app.listen(3000);
console.log("Server Listen on 127.0.0.1:3000");