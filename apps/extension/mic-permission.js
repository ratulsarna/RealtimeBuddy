(async () => {
  const status = document.getElementById("status");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    status.textContent = "Microphone access granted. You can close this tab.";
  } catch (error) {
    status.textContent = `Microphone access failed: ${String(error)}`;
  }
})();
