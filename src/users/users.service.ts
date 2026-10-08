import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { CreateUserDto } from './dto/create-user.dto';

const profileSelect = {
  profile: { select: { fullName: true } },
} satisfies Prisma.UserSelect;

const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  ...profileSelect,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

export type UserWithCredentials = Prisma.UserGetPayload<{
  include: typeof profileSelect;
}>;

export interface UserResponse {
  id: string;
  email: string;
  role: Role;
  fullName: string | null;
  emailVerified: boolean;
  createdAt: Date;
}

type UserClient = Pick<PrismaService, 'user'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string): Promise<UserWithCredentials | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: profileSelect,
    });
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    try {
      return await this.prisma.user.create({
        data: dto,
        select: publicUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('email already registered');
      }

      throw error;
    }
  }

  toUserResponse(
    user: Pick<
      User,
      'id' | 'email' | 'role' | 'emailVerifiedAt' | 'createdAt'
    > & { profile: { fullName: string | null } | null },
  ): UserResponse {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.profile?.fullName ?? null,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt,
    };
  }

  async updatePasswordHash(
    id: string,
    passwordHash: string,
    client: UserClient = this.prisma,
  ): Promise<void> {
    await client.user.update({
      where: { id },
      data: { passwordHash },
    });
  }
}
