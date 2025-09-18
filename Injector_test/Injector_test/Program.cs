using EmbedIO;
using System;
using System.Threading;
using EmbedIO.WebApi;
using EmbedIO.Routing;
using Newtonsoft.Json;
using System.IO;
using System.Text;
using System.Collections.Generic;

namespace Injector_test
{
    class Program
    {
        public static LabStandState State = new LabStandState();
        public static string FlashDriveName = "USB_DRIVE";

        static void Main(string[] args)
        {
            var url = "http://localhost:9696/";
            var server = CreateWebServer(url);

            server.RunAsync();

            Console.WriteLine("Сервер запущен на " + url);
            Console.WriteLine("Нажмите Enter для выхода...");

            var timer = new Timer(SimulationLoop, null, 0, 1000);

            Console.ReadLine();

            timer.Dispose();
        }

        public class LabStandState
        {
            public bool Pump1On { get; set; }
            public bool Pump2On { get; set; }

            public List<int> PressureData { get; set; } = new List<int>();
            public List<int> FlowData { get; set; } = new List<int>();

            public string SerialNumber { get; set; } = "";

            public DateTime StartTime { get; set; }
            public bool TestRunning { get; set; }

            private Random _rand = new Random();

            public void StartTest(string serial)
            {
                SerialNumber = serial;
                PressureData.Clear();
                FlowData.Clear();
                Pump1On = true;
                Pump2On = true;
                TestRunning = true;
                StartTime = DateTime.Now;
            }

            public void StopTest()
            {
                Pump1On = false;
                Pump2On = false;
                TestRunning = false;
            }

            public void SimulateStep()
            {
                if (!TestRunning) return;

                PressureData.Add(_rand.Next(100, 150));
                FlowData.Add(_rand.Next(10, 15));
            }
        }

        public class ApiController : WebApiController
        {
            private readonly LabStandState _state;

            public ApiController(LabStandState state)
            {
                _state = state;
            }

            [Route(HttpVerbs.Get, "/status")]
            public object GetStatus()
            {
                int pressure = _state.PressureData.Count > 0 ? _state.PressureData[_state.PressureData.Count - 1] : 0;
                int flow = _state.FlowData.Count > 0 ? _state.FlowData[_state.FlowData.Count - 1] : 0;

                return new
                {
                    pump1 = _state.Pump1On,
                    pump2 = _state.Pump2On,
                    pressure = pressure,
                    flow = flow,
                    pressureData = _state.PressureData,
                    flowData = _state.FlowData,
                    serial = _state.SerialNumber,
                    flashName = Program.FlashDriveName,
                    testRunning = _state.TestRunning
                };
            }

            [Route(HttpVerbs.Post, "/start-test")]
            public void StartTest()
            {
                string body = GetRequestBody();
                dynamic json = JsonConvert.DeserializeObject(body);
                string serial = json.serial != null ? (string)json.serial : "NO_SN";

                _state.StartTest(serial);

                HttpContext.Response.ContentType = "text/plain";

                string s = "Test started";
                byte[] data = Encoding.UTF8.GetBytes(s);
                HttpContext.Response.OutputStream.Write(data, 0, data.Length);
            }

            [Route(HttpVerbs.Post, "/eject-flash")]
            public void EjectFlash()
            {
                Program.FlashDriveName = "Нет устройства";

                HttpContext.Response.ContentType = "text/plain";

                string s = "Flash извлечён";
                byte[] data = Encoding.UTF8.GetBytes(s);
                HttpContext.Response.OutputStream.Write(data, 0, data.Length);
            }

            [Route(HttpVerbs.Post, "/save-data")]
            public void SaveData()
            {
                string fileName = _state.SerialNumber + "_test_results.txt";

                var content = new StringBuilder();
                content.AppendLine("Серийный номер: " + _state.SerialNumber);
                content.AppendLine("Давление: " + string.Join(",", _state.PressureData.ToArray()));
                content.AppendLine("Поток: " + string.Join(",", _state.FlowData.ToArray()));

                File.WriteAllText(fileName, content.ToString());

                HttpContext.Response.ContentType = "text/plain";

                string s = "Файл сохранён";
                byte[] data = Encoding.UTF8.GetBytes(s);
                HttpContext.Response.OutputStream.Write(data, 0, data.Length);
            }

            private string GetRequestBody()
            {
                using (var reader = new StreamReader(HttpContext.OpenRequestStream()))
                {
                    return reader.ReadToEnd();
                }
            }
        }
        private static WebServer CreateWebServer(string url)
        {
            var server = new WebServer(o => o
                    .WithUrlPrefix(url)
                    .WithMode(HttpListenerMode.EmbedIO))
                .WithLocalSessionManager()
                .WithWebApi("/api", m => m.WithController(() => new ApiController(State))).WithStaticFolder("/", "wwwroot", true);

            return server;
        }

        private static void SimulationLoop(object stateObj)
        {
            State.SimulateStep();

            if (State.TestRunning && (DateTime.Now - State.StartTime).TotalSeconds > 20)
            {
                State.StopTest();
            }
        }
    }
}
