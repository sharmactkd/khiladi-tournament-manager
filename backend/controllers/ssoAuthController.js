import User from "../models/user.js";
import { generateToken, generateRefreshToken } from "../utils/generateToken.js";
import { addRefreshTokenSession, buildSafeUserResponse, clearAuthCookiesEverywhere, REFRESH_COOKIE_MAX_AGE } from "./authController.js";
import { setCsrfCookie } from "../middleware/csrfProtection.js";
import { exchangeCentralCode, verifyCentralAssertion } from "../services/centralSsoService.js";

const codeRx=/^[A-Za-z0-9_-]{64,200}$/, verifierRx=/^[A-Za-z0-9._~-]{43,128}$/;
export async function centralSsoLogin(req,res){
  try {
    const {code,codeVerifier}=req.body||{};
    if(!codeRx.test(code||"")||!verifierRx.test(codeVerifier||"")) return res.status(400).json({message:"A valid central SSO callback is required"});
    const claims=verifyCentralAssertion(await exchangeCentralCode({code,codeVerifier}));
    const email=String(claims.email).trim().toLowerCase();
    let user=await User.findOne({centralIdentityId:claims.sub}).select("+refreshTokens");
    if(!user&&claims.legacyUserId) user=await User.findById(claims.legacyUserId).select("+refreshTokens");
    if(!user) user=await User.findOne({email}).select("+refreshTokens");
    if(user?.centralIdentityId&&user.centralIdentityId!==claims.sub) return res.status(409).json({message:"Account is linked to another KHILADI identity"});
    if(!user) user=new User({name:claims.name||email.split("@")[0],email,role:"player",loginProvider:"google",profilePicture:claims.picture||null,isVerified:true,isProfileComplete:false,centralIdentityId:claims.sub});
    else { if(user.email&&user.email!==email)return res.status(409).json({message:"Central identity email does not match"}); user.centralIdentityId=claims.sub;user.isVerified=true;if(!user.profilePicture&&claims.picture)user.profilePicture=claims.picture; }
    if(user.isDeleted||user.isSuspended)return res.status(403).json({message:"Account is inactive or suspended"});
    const accessToken=generateToken(user),refreshToken=generateRefreshToken(user);addRefreshTokenSession({user,rawRefreshToken:refreshToken,req});await user.save({validateBeforeSave:false});
    clearAuthCookiesEverywhere(res);const domain=process.env.NODE_ENV==="production"&&process.env.COOKIE_DOMAIN?process.env.COOKIE_DOMAIN:undefined;res.cookie("refreshToken",refreshToken,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:REFRESH_COOKIE_MAX_AGE,...(domain?{domain}:{})});setCsrfCookie(res,{userId:user._id,rawRefreshToken:refreshToken});
    return res.json({accessToken,...buildSafeUserResponse(user)});
  } catch(error){return res.status(error.status||500).json({message:error.status?error.message:"Central SSO login failed"});}
}
