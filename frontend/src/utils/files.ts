import Axios from "axios";

export const downloadFile = (url: string) => {
  try {
    Axios.get(url, {
      responseType: "blob",
    }).then((res) => {
      var blob = new Blob([res.data], { type: res.headers["content-type"] });
      var link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = url.substring(url.lastIndexOf("/") + 1);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  } catch (e) {
    console.log("ERROR - Downloading file failed: ", e);
  }
};

export const toBase64 = (file: File) =>
  new Promise<string | ArrayBuffer | null>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
