import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const profileSelect = {
  profile: { select: { firstName: true, lastName: true } },
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
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  emailVerified: boolean;
  createdAt: Date;
}

type UserClient = Pick<PrismaService, 'user'>;

const joinNames = (
  firstName?: string | null,
  lastName?: string | null,
): string | null => {
  const parts = [firstName, lastName].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : null;
};

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
      where: { email: email.toLocaleLowerCase() },
      include: profileSelect,
    });
  }

  async create({
    firstName,
    lastName,
    ...dto
  }: CreateUserDto): Promise<PublicUser> {
    try {
      return await this.prisma.user.create({
        data: {
          ...dto,
          profile: { create: { firstName, lastName } },
        },
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

  async updateProfile(id: string, dto: UpdateUserDto): Promise<UserResponse> {
    const firstName = dto.firstName?.trim() || null;
    const lastName = dto.lastName?.trim() || null;

    if (!firstName) {
      // Guard: firstName is required on the write path.
      throw new ConflictException('firstName is required');
    }

    try {
      await this.prisma.userProfile.upsert({
        where: { userId: id },
        create: { userId: id, firstName, lastName },
        update: { firstName, lastName },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('User not found');
      }

      throw error;
    }

    return this.toUserResponse(await this.findById(id));
  }

  toUserResponse(
    user: Pick<
      User,
      'id' | 'email' | 'role' | 'emailVerifiedAt' | 'createdAt'
    > & {
      profile: {
        firstName: string | null;
        lastName: string | null;
      } | null;
    },
  ): UserResponse {
    const profile = user.profile;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      fullName: joinNames(profile?.firstName, profile?.lastName),
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

  async updateRole(
    id: string,
    role: Role,
    client: UserClient = this.prisma,
  ): Promise<PublicUser> {
    return client.user.update({
      where: { id },
      data: { role },
      select: publicUserSelect,
    });
  }
}
