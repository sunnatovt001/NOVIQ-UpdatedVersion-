export function createAdminAuthorization(db, sessions) {
  return async function requireAdmin(token) {
    const user = await sessions.resolve(token);
    if (!user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
    // Never accept an email, role, UID or isAdmin flag from the request body.
    const role = await db.collection('auth_roles').findOne({ _id: user.uid });
    if (role?.isAdmin !== true) throw Object.assign(new Error('Admin access required.'), { status: 403 });
    return user;
  };
}
