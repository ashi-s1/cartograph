import { Controller, Post, Get } from '@nestjs/common';

@Controller('/api/v1/auth')
export class AuthController {
  @Post('login')
  login() { return {}; }

  @Get('me')
  me() { return {}; }
}
