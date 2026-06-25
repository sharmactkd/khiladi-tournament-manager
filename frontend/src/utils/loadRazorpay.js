// frontend/src/utils/loadRazorpay.js

let razorpayScriptPromise = null;

export const loadRazorpay = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only be loaded in browser"));
  }

  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }

  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.Razorpay) {
        resolve(window.Razorpay);
      } else {
        reject(new Error("Razorpay SDK loaded but window.Razorpay not found"));
      }
    };

    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error("Failed to load Razorpay SDK"));
    };

    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
};

export default loadRazorpay;