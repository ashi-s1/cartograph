import { Controller, Get, Post, Delete } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  findAll() { return []; }

  @Get(':id')
  findOne() { return null; }

  @Post()
  create() { return null; }

  @Delete(':id')
  remove() { return true; }
}
