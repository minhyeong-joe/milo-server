import prisma from "../db/prisma.js";

const AUTH_PROVIDER = "supabase";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getDisplayName(supabaseUser, fallbackDisplayName) {
  return (
    supabaseUser.user_metadata?.displayName ??
    supabaseUser.user_metadata?.display_name ??
    supabaseUser.user_metadata?.name ??
    fallbackDisplayName ??
    null
  );
}

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    authProvider: user.authProvider,
    authProviderUserId: user.authProviderUserId,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function syncSupabaseUser(supabaseUser, options = {}) {
  if (!supabaseUser?.id || !supabaseUser?.email) {
    throw new Error("Supabase user id and email are required.");
  }

  const email = normalizeEmail(supabaseUser.email);
  const displayName = getDisplayName(supabaseUser, options.displayName);

  const existingByAuth = await prisma.user.findUnique({
    where: {
      authProvider_authProviderUserId: {
        authProvider: AUTH_PROVIDER,
        authProviderUserId: supabaseUser.id,
      },
    },
  });

  if (existingByAuth) {
    const user = await prisma.user.update({
      where: { id: existingByAuth.id },
      data: {
        email,
        displayName,
        deletedAt: null,
      },
    });

    return serializeUser(user);
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingByEmail) {
    const user = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        displayName,
        authProvider: AUTH_PROVIDER,
        authProviderUserId: supabaseUser.id,
        deletedAt: null,
      },
    });

    return serializeUser(user);
  }

  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      authProvider: AUTH_PROVIDER,
      authProviderUserId: supabaseUser.id,
    },
  });

  return serializeUser(user);
}

export async function findAppUserForSupabaseUser(supabaseUser) {
  if (!supabaseUser?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      authProvider_authProviderUserId: {
        authProvider: AUTH_PROVIDER,
        authProviderUserId: supabaseUser.id,
      },
    },
  });

  return user ? serializeUser(user) : null;
}
