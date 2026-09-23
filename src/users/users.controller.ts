import { Controller, Get, Param } from '@nestjs/common';
import { PublicUser, UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PublicUser> {
    return this.usersService.findById(id);
  }
}
