const socket = io({ auth: { cookie: document.cookie } });
const span = document.getElementById("response");

document.getElementById('sendFileBtn').addEventListener('click', () => {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const fileData = event.target.result;
            const fileName = file.name;
            socket.emit('upload_file', { 
                fileName: fileName, 
                fileData: fileData 
            }, (response) => {
                fileInput.value = '';
                if(response.status !== 200) span.innerHTML = response.text;
                else span.innerHTML = response.text;
            });
        };
        reader.readAsArrayBuffer(file);
    } else {
        alert('Please select a file!');
    }
});