import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { LoggedInUserData } from '../../interfaces/authenticated-user.interface.js';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): LoggedInUserData => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as LoggedInUserData;
  },
);
