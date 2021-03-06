const express = require('express');
const pgp = require('pg-promise')();
const passport = require('passport');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const LocalStrategy = require('passport-local').Strategy;
const nodemailer = require('nodemailer');

const app = express();

// Passport Config
passport.use(
    new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
        console.log('Made it to auth!');

        // Match User
        db.tx(t => {
            return t.oneOrNone('SELECT * FROM users WHERE \'' + email + '\' = email;');
        })
        .then((rows) => {
            const user = rows;
            if (!user) {
            console.log('Wrong email!');
            return done(null, false, { message: 'That email is not registered' });
            }

            //Check if user has verified their account via email
            if(!user.verified){
                console.log("Confirm Email to Login"); // User has not verified email
                return done(null, false, { message: 'That email is not verified' });
            }

            // Match Password
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    throw err;
                }

                if (isMatch) {
                    console.log('Made it past username and password checks!');
                    return done(null, user);
                } else {
                    console.log('Wrong password!');
                    return done(null, false, { message: 'Password incorrect' });
                }
            });
        })
        .catch((error) => {
            console.log(error);
        });
    
}));

// Configure Mail Server Responsible for Sending/Recieving Mail
var smtpTransport = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: "forte.music.help@gmail.com",
        pass: "Paradise1!"
    }
});
var rand, mailOptions, host, link;

// Begin Email Routing
app.get('/send', function(req, res){
    rand=Math.floor((Math.random() * 100) + 54);
	host=req.get('host');
	link="http://"+req.get('host')+"/verify?id="+rand;
	mailOptions={
        from: 'forte.music.help@gmail.com', //sender address
		to : req.query.to, // Reciever
		subject : "Please confirm your Email account",
		html : "Hello,<br> Please Click on the link to verify your email.<br><a href="+link+">Click here to verify</a>"	
	}
	console.log(mailOptions);
	smtpTransport.sendMail(mailOptions, function(error, response){
   	 if(error){
        	console.log(error);
		res.end("error");
	 }else{
        	console.log("Message sent: " + response.message);
		res.end("sent");
         }
    });
});

// Veritfy Email
app.get('/verify',function(req,res){
    console.log(req.protocol+":/"+req.get('host'));

    if((req.protocol+"://"+req.get('host'))==("http://"+host))
    {
        console.log("Domain is matched. Information is from Authentic email");
        if(req.query.id==rand)
        {
            // User's account updated in database to verified
            console.log("email is verified");
            res.end("<h1>Email "+mailOptions.to+" is been Successfully verified");

            db.tx(v => {
                return v.none('UPDATE users SET verified = $1 WHERE email = $2', [true, mailOptions.to]);
            })
            .then(data => {
                //success
            })
            .catch(error =>{
                console.log('ERROR:', error);
            });
        }
        else
        {
            console.log("email is not verified");
            res.end("<h1>Bad Request</h1>");
        }
    }
    else
    {
        res.end("<h1>Request is from unknown source");
    }
});

// Passport Serialize/Deserialize
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    db.tx(t => {
        return t.one('SELECT * FROM users WHERE \'' + id + '\' = id;');
    })
    .then((res) => {
        done(null, res);
    })
    .catch((err) => {
        console.log(err);
    });
});

// Connect to Database
const dbConfig = {
    host: 'fortedb.cfsvavbwa9qq.us-east-2.rds.amazonaws.com',
    port: 5432,
    database: 'forte',
    user: 'fortemaster',
    password: 'Paradise1!'
};

let db = pgp(dbConfig);

// Express Session
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// connect flash
app.use(flash());

// global vars
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

// EJS
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Body-parser
app.use(express.urlencoded({ extended: false}));

// Routes //

// Splash Page
app.get('/', (req, res) => {
    res.render('pages/splash', {
        my_title: 'Splash Page'
    });
});

// Login Page
app.get('/login', (req, res) => {
    res.render('pages/login', {
        my_title: 'Login Page'
    });
});

app.post('/login', (req, res, next) => {
    const { email } = req.body;
    db.tx(t => {
        return t.oneOrNone('SELECT type FROM users WHERE \'' + email + '\' = email;');
    })
    .then((data) => {
         if (data == null) {
                errors.push({ msg: 'Email is not registered' });
                res.render('pages/login', {
                    errors,
                    email,
                    password
                });
            } else if (data.type == 'student') {
                passport.authenticate('local', {
                    successRedirect: ('/student-dashboard'),
                    failureRedirect: '/login',
                    failureFlash: true
                })(req, res, next);
            } else {
                passport.authenticate('local', {
                    successRedirect: ('/teacher-dashboard'),
                    failureRedirect: '/login',
                    failureFlash: true
                })(req, res, next);
            }
    })
    .catch(err => {
      console.log(err);
    });
});


// Registration Page
app.get('/registration', (req, res) => {
    res.render('pages/registration', {
        my_title: 'Registration Page'
    });
});

app.post('/registration', (req, res) => {
    const { name,
        instrument,
        email,
        password,
        password2,
        userType
        } = req.body;

    let errors = [];

    // check required fields
    if (!name || !instrument || !email || !password || !password2 || !userType) {
        errors.push({ msg: 'Please fill in all fields' });
    }

    // check passwords match
    if (password !== password2) {
        errors.push({ msg: 'Passwords do not match' });
    }

    // check password length
    if (password.length < 6) {
        errors.push({ msg: 'Password should be at least 6 characters' });
    }

    // if there are errors, stay on page
    if (errors.length > 0) {
        res.render('pages/registration', {
            errors,
            name,
            instrument,
            email
        });
    } else {

        // Check if user exists in database
        db.tx(t => {
            return t.oneOrNone('SELECT * FROM users WHERE \'' + email + '\' = email;');
        })
        .then((rows) => {
            console.log(rows);
            if (rows !== null) {
                errors.push({ msg: 'Email already taken' });
                res.render('pages/registration', {
                    errors,
                    name,
                    instrument,
                    email
                });
            }
        })
        .catch((err) => {
            console.log(err);
        });

        // Store user in database
        console.log('Storing user!');
        db.tx(t => {
            return t.one('SELECT MAX(id) FROM users;');
        })
        .then((data) => {
            let lastUserId = data.max;

            lastUserId++;

            // Hash Password
            bcrypt.genSalt(12, (err, salt) => {
                bcrypt.hash(password, salt, (err, hash) => {
                    if (err) throw err;

                    // Set password to hashed version
                    let hashedPassword = hash;
                    console.log('Generated hashed password: ');
                    console.log(hashedPassword);

                    db.tx(t => {
                        console.log('Storing hashed password: ');
                        console.log(hashedPassword);
                        return t.none('INSERT INTO Users(id, name, email, password, instrument, type, strikes, thumbsup, verified) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                        [
                            lastUserId,
                            name,
                            email,
                            hashedPassword,
                            instrument,
                            userType,
                            0,
                            0,
                            false
                        ])
                        .then(t => {
                            req.flash(
                                'success_msg',
                                'Please log into your email to verify your account.'
                            );
                            res.redirect('/login');
                        })
                        .catch((err) => {
                            console.log(err);
                        });
                    })
                    .catch((err) => {
                        console.log(err);
                    });
                });
            })  
        })
        .catch((err) => {
            console.log(err);
        });
    }
});


// Student Dashboard
app.get('/student-dashboard', (req, res) => {
    // Get Info
    let upcomingLessons = 'select * from meetings where users_usersid = \'' + req.user.id + '\' order by date asc;';

    db.task('get-upcoming-lessons', task => {
        return task.batch([
            task.any(upcomingLessons)
        ]);
    })
    .then(info => {
        // Get all teachers - need to optimize
        let teachers = 'select id,name from users where type = \'teacher\';';

        db.task('get-teachers', task => {
            return task.batch([
                task.any(teachers)
            ]);
        })
        .then(data => {
            res.render('pages/student-dashboard', {
                my_title: 'Student Dashboard',
                name: req.user.name,
                upcoming: info[0],
                teachers: data[0]
            });
        })
        .catch((err) => {
            console.log(err);
        });
    })
    .catch((err) => {
        console.log(err);
    });
});

// Search
app.get('/student-teacher_search', (req, res) => {
    let teacher = 'teacher';
    
    let allUsers = "select * from users where type = 'teacher' ORDER by name asc;";

    db.task('get-all-users', task => {
        return task.batch([
            task.any(allUsers)
        ]);
    })
    .then(info => {
        console.log(req.user.instrument)
        res.render('pages/student-teacher_search', {
            my_title: 'Search',
            users: info[0]
        });
    })
    .catch((err) => {
        console.log(err);
    });
})

// Teacher Dashboard
app.get('/teacher-dashboard', (req, res) => {
    // Get Info
    let upcomingLessons = 'select * from meetings where teachers_teacherid = \'' + req.user.id + '\' order by date asc;';

    db.task('get-upcoming-lessons', task => {
        return task.batch([
            task.any(upcomingLessons)
        ]);
    })
    .then(info => {
        // Get all students - need to optimize
        let students = 'select id,name from users where type = \'student\';';

        db.task('get-students', task => {
            return task.batch([
                task.any(students)
            ]);
        })
        .then(data => {
            res.render('pages/teacher-dashboard', {
                my_title: 'Teacher Dashboard',
                name: req.user.name,
                upcoming: info[0],
                teachers: data[0]
            });
        })
        .catch((err) => {
            console.log(err);
        });
    })
    .catch((err) => {
        console.log(err);
    });
});


// Logout
app.get('/logout', (req, res) => {
    req.logout();
    req.flash('success_msg', 'You are logged out');
    res.redirect('/login');
});





const PORT = process.env.PORT || 3000;

app.listen(PORT, console.log('Server started on port' + PORT));