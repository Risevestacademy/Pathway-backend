import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from '../analytics';
import { isValidAvatarUrl } from '../cloudinary';
import { DomainException } from '../common';
import { EnvironmentVariables } from '../config';
import {
  EducationLevel,
  ExperienceYears,
  InternshipCount,
  Prisma,
  Role,
  TargetLevel,
  User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const profileFieldsSelect = {
  firstName: true,
  lastName: true,
  avatarUrl: true,
  careerStage: true,
  educationLevel: true,
  internshipCount: true,
  experienceYears: true,
  learningGoals: true,
  weeklyTimeCommitment: true,
  careerInterests: true,
} satisfies Prisma.UserProfileSelect;

const profileSelect = {
  profile: { select: profileFieldsSelect },
} satisfies Prisma.UserSelect;

const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  analyticsEnabled: true,
  createdAt: true,
  updatedAt: true,
  ...profileSelect,
} satisfies Prisma.UserSelect;

type ProfileFields = Prisma.UserProfileGetPayload<{
  select: typeof profileFieldsSelect;
}>;

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
  avatarUrl: string | null;
  careerStage: TargetLevel | null;
  educationLevel: EducationLevel | null;
  internshipCount: InternshipCount | null;
  experienceYears: ExperienceYears | null;
  learningGoals: string[];
  weeklyTimeCommitment: string | null;
  careerInterests: string[];
  analyticsEnabled: boolean;
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
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

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
    const { analyticsEnabled, ...fields } = dto;
    const profile = this.toProfileData(fields);

    if (profile.avatarUrl) this.assertOwnAvatarUrl(id, profile.avatarUrl);

    if (profile.careerInterests?.length)
      await this.assertKnownFieldSlugs(id, profile.careerInterests);

    let flagChanged: boolean;
    try {
      flagChanged = await this.prisma.$transaction(async (tx) => {
        await tx.userProfile.upsert({
          where: { userId: id },
          create: { userId: id, ...profile },
          update: profile,
        });

        if (analyticsEnabled === undefined) return false;

        const { count } = await tx.user.updateMany({
          where: { id, analyticsEnabled: { not: analyticsEnabled } },
          data: { analyticsEnabled },
        });
        return count > 0;
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

    if (flagChanged) this.analytics.invalidateUser(id);

    const sent = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    this.logger.log({ userId: id, fields: sent }, 'Profile updated');

    return this.toUserResponse(await this.findById(id));
  }

  toUserResponse(
    user: Pick<
      User,
      | 'id'
      | 'email'
      | 'role'
      | 'emailVerifiedAt'
      | 'analyticsEnabled'
      | 'createdAt'
    > & {
      profile: ProfileFields | null;
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
      avatarUrl: profile?.avatarUrl ?? null,
      careerStage: profile?.careerStage ?? null,
      educationLevel: profile?.educationLevel ?? null,
      internshipCount: profile?.internshipCount ?? null,
      experienceYears: profile?.experienceYears ?? null,
      learningGoals: profile?.learningGoals ?? [],
      weeklyTimeCommitment: profile?.weeklyTimeCommitment ?? null,
      careerInterests: profile?.careerInterests ?? [],
      analyticsEnabled: user.analyticsEnabled,
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

  // Prisma skips undefined fields; null lists are stored as empty
  private toProfileData({
    learningGoals,
    careerInterests,
    ...fields
  }: Omit<UpdateUserDto, 'analyticsEnabled'>) {
    return {
      ...fields,
      learningGoals: learningGoals === null ? [] : learningGoals,
      careerInterests: careerInterests === null ? [] : careerInterests,
    };
  }

  private assertOwnAvatarUrl(userId: string, avatarUrl: string): void {
    const valid = isValidAvatarUrl(
      avatarUrl,
      userId,
      this.config.get('CLOUDINARY_CLOUD_NAME', { infer: true }),
      this.config.get('CLOUDINARY_ALLOWED_HOST', { infer: true }),
    );
    if (valid) return;

    this.logger.warn(
      { userId, reason: 'INVALID_AVATAR_URL' },
      'Profile update rejected',
    );
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'INVALID_AVATAR_URL',
      "avatarUrl must be a Cloudinary upload in the user's avatar folder",
    );
  }

  private async assertKnownFieldSlugs(
    userId: string,
    slugs: string[],
  ): Promise<void> {
    const known = await this.prisma.field.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true },
    });
    const knownSlugs = new Set(known.map(({ slug }) => slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length === 0) return;

    this.logger.warn(
      { userId, reason: 'UNKNOWN_CAREER_INTEREST' },
      'Profile update rejected',
    );
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'UNKNOWN_CAREER_INTEREST',
      'careerInterests contains unknown field slugs',
      { slugs: unknown },
    );
  }
}
