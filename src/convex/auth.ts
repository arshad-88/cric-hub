// Gmail + OTP sign-in. Everyone logs in with their email address: entering
// the address sends a 6-digit code to that inbox, and entering the code
// confirms the session. New addresses get a profile instantly (name is set
// later in My Hub). The phone number on the profile is optional — it is the
// identity organizers use to pull a player's name + career stats onto a
// roster (see users.lookupByPhone).
//
// NOTE (vly auth docs): this file may be modified to add a new auth provider
// in accordance with the vly auth documentation. The Email provider is the
// sanctioned way to run OTP-based email sign-in.

import { convexAuth } from "@convex-dev/auth/server";
import { emailOtp } from "./auth/emailOtp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp],
});
