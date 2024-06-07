# Enable Enable Single Sign-on with authorized access to a secured API

To enable Single Sign-on with authorized access to a secured API the following code need to be changed

1. In /src/index.ts, comment the lines 68-72 that defined the storage as BlobStorage. Uncomment the line 75 to define the MemoryStorage
1. In /src/bot/teamsAI.ts, in line 137 set the autoSignIn to true. This will allow Single Sign-in to start of every message.

When the above is changed, the TCS will first check if the user has signed in. It will do this by checking if a access token is present in the temp state. If this is not the case, it will start the authentication flow. The authentication flow is using single sign-on with the user that is signed in into Teams.

> NOTE!!! The Single Sign On will only work when the application is started in Teams. It is not possible to use Single Sign On in the TestTool as this does not support the auth card.

## Application to Sign in to

The application that is used to sign in, is the application that is created standard with the TCS and is defined by the AAD_APP_CLIENT_ID. The associated app registration does contain a scope with the name api://BOT_ID/access_as_user, which is created as part of the application deployed. This scope is used to obtain an access token to call the sample authorized API.

> NOTE: If a users signs in for the first time a consent is required. Teams will show a message above the input message box, where the user can click to start the consent. This will open a new browser windows, where the user signs in and need to consent the application defined by AAD_APP_CLIENT_ID. This only need to be done once.

## Authorized API

For simplicity an authorized API has been included in the TCS. The access point in defined in /src/index.ts.

``` typescript
    server.get("/api/quotes/:ticker", jwtValidator.validateJwt, getTickerQuote);
```

This endpoint Listen for incoming requests to "/api/quotes/ticker", where ticker is a ticker value for a company. This is a sample API that returns a random quote for a given ticker symbol. The implementation is in function getTickerQuote in [/src/api/apiTicker.ts](../../src/api/apiTicker.ts). The API is protected by a JWT token. The token is validated by the jwtValidator middleware define in [/src/services/jwtValidator](../../src/services/jwtValidator.ts). The token is check if it originates from the correct tenant and has the AAD_APP_CLIENT_ID as audience.
