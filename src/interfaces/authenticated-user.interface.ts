export type LoggedInUserData = {
  id: string;
  email: string;
  type: 'USER' | 'ADMIN';
};

export type LoggedInUserWithRefreshToken = LoggedInUserData & {
  refreshToken: string;
};

export type GoogleUser = {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  accessToken: string;
};

export interface AuthenticatedRequest extends Request {
  user: LoggedInUserData;
}

export interface AuthenticatedRequestWithRefreshToken extends Request {
  user: LoggedInUserWithRefreshToken;
}

export interface GoogleAuthRequest extends Request {
  user: GoogleUser;
}
