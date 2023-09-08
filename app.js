const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const newUserDetails = request.body;
  const { username, password, name, gender } = newUserDetails;
  const isUserExistsQuery = `
    SELECT * FROM
    user 
    WHERE
    username = '${username}';`;
  const dbUser = await db.get(isUserExistsQuery);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (dbUser === undefined && password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const createUserQuery = `
        INSERT INTO
        user (name,username,password,gender)
        VALUES ('${name}','${username}','${hashedPassword}','${gender}');`;
    const dbResponse = await db.run(createUserQuery);
    response.status(200);
    response.send("User created successfully");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//get tweets of following users
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT user_id FROM
  user
  WHERE 
  username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowerUserIdQuery = `
  SELECT following_user_id FROM
  follower
  WHERE
  follower_user_id = ${userId.user_id};`;
  const followingUserIdsArray = await db.all(getFollowerUserIdQuery);
  const getFollowerIdArray = followingUserIdsArray.map((eachUserIdObject) => {
    return eachUserIdObject.following_user_id;
  });

  const getTweetQuery = `
  SELECT 
  user.username, tweet.tweet, tweet.date_time as dateTime
  FROM
  user inner join tweet
  on user.user_id = tweet.user_id
  WHERE user.user_id in (${getFollowerIdArray})
  ORDER BY 
  tweet.date_time DESC
  LIMIT 4;`;
  const tweets = await db.all(getTweetQuery);
  response.send(tweets);
});

//get names of following users
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT user_id FROM
  user
  WHERE 
  username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowerUserIdQuery = `
  SELECT following_user_id FROM
  follower
  WHERE
  follower_user_id = ${userId.user_id};`;
  const followingUserIdsArray = await db.all(getFollowerUserIdQuery);

  const getFollowerID = followingUserIdsArray.map((eachObject) => {
    return eachObject.following_user_id;
  });

  const getFollowersNamesQuery = `
  SELECT name FROM
  user
  WHERE
  user_id in (${getFollowerID});`;
  const getFollowerNames = await db.all(getFollowersNamesQuery);
  response.send(getFollowerNames);
});

//Get Followers Names
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `
    SELECT user_id 
    FROM
    user
    WHERE
    username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getFollowerIdsQuery = `
    SELECT follower_user_id 
    FROM
    follower
    WHERE
    following_user_id = ${userId.user_id};`;
  const getFollowersIdArray = await db.all(getFollowerIdsQuery);
  const getFollowersUserIdsArray = getFollowersIdArray.map((eachObject) => {
    return eachObject.follower_user_id;
  });

  const getFollowersNameQuery = `
    SELECT name FROM user
    WHERE user_id in (${getFollowersUserIdsArray});`;
  const followersNames = await db.all(getFollowersNameQuery);
  response.send(followersNames);
});

//Get Tweet,likes,replies count

const convertDataToResponse = (likesCount, replyCount, tweetDateTime) => {
  return {
    tweet: tweetDateTime.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetDateTime.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserIdQuery = `
    SELECT user_id FROM user
    WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getFollowingIdsQuery = `
    SELECT following_user_id FROM follower
    WHERE follower_user_id = ${userId.user_id};`;
  const followingIdsArray = await db.all(getFollowingIdsQuery);

  const getFollowingIds = followingIdsArray.map((eachObject) => {
    return eachObject.following_user_id;
  });

  const getTweetIdsQuery = `
    SELECT tweet_id FROM tweet
    WHERE user_id in (${getFollowingIds});`;
  const tweetIdsArray = await db.all(getTweetIdsQuery);
  const followingTweetIds = tweetIdsArray.map((eachObject) => {
    return eachObject.tweet_id;
  });

  if (followingTweetIds.includes(parseInt(tweetId))) {
    const getLikesCountQuery = `
        SELECT count(user_id) as likes
        FROM
        like
        WHERE
        tweet_id = ${tweetId};`;
    const likesCount = await db.get(getLikesCountQuery);

    const getReplyCountQuery = `
        SELECT count(user_id) as replies
        FROM reply
        WHERE
        tweet_id = ${tweetId};`;
    const replyCount = await db.get(getReplyCountQuery);

    const getTweetDateTimeQuery = `
        SELECT tweet,date_time FROM tweet
        WHERE
        tweet_id = ${tweetId};`;
    const tweetDateTime = await db.get(getTweetDateTimeQuery);

    response.send(convertDataToResponse(likesCount, replyCount, tweetDateTime));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//Get Names who Liked the Tweet

const convertWhoLikedNamesToResponseObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await db.get(getUserIdQuery);

    const getFollowingIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`;
    const followingIdsArray = await db.all(getFollowingIdsQuery);
    const followingIdsList = followingIdsArray.map((eachObject) => {
      return eachObject.following_user_id;
    });

    const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id in (${followingIdsList});`;
    const getTweetIdsArray = await db.all(getTweetIdsQuery);
    const tweetIdsList = getTweetIdsArray.map((eachObject) => {
      return eachObject.tweet_id;
    });

    if (tweetIdsList.includes(parseInt(tweetId))) {
      const getNamesWhoLikedQuery = `
        SELECT user.username as likes FROM user
        INNER JOIN like ON user.user_id = like.user_id
        WHERE like.tweet_id = ${tweetId};`;
      const getNamesWhoLikedArray = await db.all(getNamesWhoLikedQuery);
      const likedUserNamesList = getNamesWhoLikedArray.map((eachObject) => {
        return eachObject.likes;
      });
      response.send(convertWhoLikedNamesToResponseObject(likedUserNamesList));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get Replies List Of The Tweet

const convertUsernameReplyTweetsToResponseObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await db.get(getUserIdQuery);

    const getFollowingIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`;
    const followingIdsArray = await db.all(getFollowingIdsQuery);
    const followingIdsList = followingIdsArray.map((eachObject) => {
      return eachObject.following_user_id;
    });

    const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id in (${followingIdsList});`;
    const getTweetIdsArray = await db.all(getTweetIdsQuery);
    const tweetIdsList = getTweetIdsArray.map((eachObject) => {
      return eachObject.tweet_id;
    });

    if (tweetIdsList.includes(parseInt(tweetId))) {
      const getUsernameReplyTweetsQuery = `
        SELECT user.name, reply.reply FROM
        user INNER JOIN reply on user.user_id = reply.user_id
        WHERE reply.tweet_id = ${tweetId};`;
      const usernameReplyTweets = await db.all(getUsernameReplyTweetsQuery);

      response.send(
        convertUsernameReplyTweetsToResponseObject(usernameReplyTweets)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get List Of All Tweets Of User
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getTweetsQuery = `
  SELECT
  tweet,
  COUNT(DISTINCT like_id) AS likes,
  COUNT(DISTINCT reply_id) AS replies,
  tweet.date_time AS dateTime
  FROM
  user
  NATURAL JOIN tweet
  INNER JOIN like ON tweet.tweet_id = like.tweet_id
  INNER JOIN reply on tweet.tweet_id = reply.tweet_id
  WHERE
  username = '${username}'
  GROUP BY
  tweet.tweet_id;`;
  const tweetsList = await db.all(getTweetsQuery);
  response.send(tweetsList);
});

//Create Tweet
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const { tweet } = request.body;

  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const currentDate = new Date();

  const createTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
    VALUES('${tweet}',${userId.user_id},'${currentDate}');`;
  const createTweet = await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//Delete Tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //console.log(tweetId);
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    //console.log(getUserId.user_id);
    //tweets made by the user
    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await db.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    console.log(getUserTweetsList);
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
