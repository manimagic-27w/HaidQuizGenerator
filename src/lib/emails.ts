const emailList = (v: string | undefined) => (v || "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Site admins: set up families. ADMIN_EMAILS, or PARENT_EMAILS on setups from before families existed. */
export const adminEmails = () => emailList(process.env.ADMIN_EMAILS || process.env.PARENT_EMAILS);

/** Used once, when existing users are first moved into a family: these become its parents. */
export const legacyParentEmails = () => [...new Set([...emailList(process.env.PARENT_EMAILS), ...emailList(process.env.ADMIN_EMAILS)])];
