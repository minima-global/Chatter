function autoGrow(element) {
  if (element.scrollHeight > 80) {
    element.style.height = "5px";
    element.style.height = (element.scrollHeight)+"px";
  } else {
    element.style.height = "fit-content";
  }
};

function checkGrow(element) {
  if (element.value.length === 0) {
    element.style.height = "fit-content";
  }
}

function loadYoutube(el, videoId) {
  return el.innerHTML = `
  <iframe
    width="560"
    height="315"
    src="https://www.youtube.com/embed/${videoId}?autoplay=1"
    frameborder="0"
    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
  ></iframe>
  `;
}
