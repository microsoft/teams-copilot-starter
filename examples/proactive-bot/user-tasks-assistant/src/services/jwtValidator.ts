import * as jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { Env } from "../env";
import { container } from "tsyringe";

export const validateRole = (role: string) => {
  return async (req: any, res: any, next: any) => {
    const hasRole = false;
    if (req.user.roles === undefined) return hasRole;
    for (let i = 0; i < req?.user?.roles.length; i++) {
      const currentRole = req.user.roles[i];
      if (currentRole === role) {
        return next();
      }
    }
    res.send(401);
  };
};

export const validateJwt = (req: any, res: any, next: any): void => {
  // Create the environment variables
  const env = container.resolve<Env>(Env);
  const tenantID = env.data.AAD_APP_TENANT_ID;
  const DISCOVERY_KEYS_ENDPOINT = `https://login.microsoftonline.com/${tenantID}/discovery/v2.0/keys`;
  const audience = env.data.AAD_APP_CLIENT_ID;

  const getSigningKeys = (header: any, callback: any): void => {
    const client = jwksClient({
      jwksUri: DISCOVERY_KEYS_ENDPOINT,
    });

    client.getSigningKey(header.kid, function (err, key: any) {
      if (err === null) {
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
      }
    });
  };

  const authHeader = req.headers.authorization;
  if (authHeader !== undefined) {
    const token = authHeader.split(" ")[1];
    if (audience === null) {
      return next();
    }
    const validationOptions = {
      audience, // v2.0 token, ensure to set accessTokenAcceptedVersion: 2, in app registration manifest
    };

    jwt.verify(token, getSigningKeys, validationOptions, (err, payload) => {
      if (err != null) {
        return next(err);
      }

      req.user = payload;
      return next();
    });
  } else {
    res.send(401);
  }
};
