import 'package:flutter/material.dart';
import 'NotificationService.dart';

class NotificationEdit extends StatefulWidget {
  final String type; // 'privacy' หรือ 'stories'
  final Map<String, dynamic> currentSettings;

  const NotificationEdit({
    super.key,
    required this.type,
    required this.currentSettings,
  });

  @override
  State<NotificationEdit> createState() => _NotificationEditState();
}

class _NotificationEditState extends State<NotificationEdit> {
  final NotificationService _notificationService = NotificationService();
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _emailController;
  late List<String> _usernames;
  late NotificationFrequency _selectedFrequency;
  late int _selectedCheckFrequency;
  late bool _isActive;

  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _initializeControllers();
  }

  void _initializeControllers() {
    _emailController =
        TextEditingController(text: widget.currentSettings['email'] ?? '');
    _usernames = List<String>.from(widget.currentSettings['usernames'] ?? []);
    _selectedFrequency =
        widget.currentSettings['frequency'] ?? NotificationFrequency.daily;
    _selectedCheckFrequency =
        widget.currentSettings['checkFrequency'] ?? 4; // every12Hours
    _isActive = widget.currentSettings['isActive'] ?? true;
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  String _getFrequencyText(NotificationFrequency frequency) {
    switch (frequency) {
      case NotificationFrequency.daily:
        return 'ทุกวัน';
      case NotificationFrequency.weekly:
        return 'ทุกสัปดาห์';
      case NotificationFrequency.monthly:
        return 'ทุก 1 เดือน';
      case NotificationFrequency.quarterly:
        return 'ทุก 3 เดือน';
      case NotificationFrequency.semiAnnually:
        return 'ทุก 6 เดือน';
      case NotificationFrequency.nineMonths:
        return 'ทุก 9 เดือน';
      case NotificationFrequency.yearly:
        return 'ทุกปี';
    }
  }

  String _getCheckFrequencyText(int frequency) {
    switch (frequency) {
      case 0:
        return 'ทุก 5 นาที';
      case 1:
        return 'ทุก 30 นาที';
      case 2:
        return 'ทุก 1 ชั่วโมง';
      case 3:
        return 'ทุก 3 ชั่วโมง';
      case 4:
        return 'ทุก 6 ชั่วโมง';
      case 5:
        return 'ทุก 8 ชั่วโมง';
      case 6:
        return 'ทุก 12 ชั่วโมง';
      case 7:
        return 'ทุก 1 วัน';
      default:
        return 'ทุก 12 ชั่วโมง';
    }
  }

  Future<void> _saveSettings() async {
    if (!_formKey.currentState!.validate()) return;
    if (_usernames.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('กรุณาเพิ่ม username อย่างน้อย 1 รายการ'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      await _notificationService.saveNotificationSettings(
        type: widget.type,
        usernames: _usernames,
        email: _emailController.text.trim(),
        frequency: _selectedFrequency,
        checkFrequency: CheckFrequency.values[_selectedCheckFrequency],
        isActive: _isActive,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('บันทึกการตั้งค่าเรียบร้อยแล้ว'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.of(context).pop(true); // ส่ง true กลับไปเพื่อ refresh
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('เกิดข้อผิดพลาด: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _addUsername() {
    final textController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('เพิ่ม Username'),
        content: TextField(
          controller: textController,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Username',
            hintText: 'กรอก username (ไม่ต้องใส่ @)',
          ),
          onSubmitted: (value) {
            if (value.trim().isNotEmpty) {
              setState(() {
                _usernames.add(value.trim());
              });
              Navigator.of(context).pop();
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('ยกเลิก'),
          ),
          TextButton(
            onPressed: () {
              if (textController.text.trim().isNotEmpty) {
                setState(() {
                  _usernames.add(textController.text.trim());
                });
                Navigator.of(context).pop();
              }
            },
            child: const Text('เพิ่ม'),
          ),
        ],
      ),
    );
  }

  void _removeUsername(String username) {
    setState(() {
      _usernames.remove(username);
    });
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.type == 'privacy'
        ? 'แก้ไขการตั้งค่า Privacy'
        : 'แก้ไขการตั้งค่า Stories';
    final icon =
        widget.type == 'privacy' ? Icons.privacy_tip : Icons.auto_stories;

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
        actions: [
          if (!_isLoading)
            IconButton(
              onPressed: _saveSettings,
              icon: const Icon(Icons.save),
              tooltip: 'บันทึก',
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Card(
                      elevation: 4,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Icon(icon, color: Colors.deepPurple, size: 32),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'แก้ไขการตั้งค่าการแจ้งเตือน',
                                    style: TextStyle(
                                      fontSize: 14,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    // สถานะการทำงาน
                    Card(
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            const Icon(Icons.power_settings_new,
                                color: Colors.grey),
                            const SizedBox(width: 12),
                            const Text(
                              'สถานะการทำงาน:',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w500),
                            ),
                            const Spacer(),
                            Switch(
                              value: _isActive,
                              onChanged: (value) {
                                setState(() {
                                  _isActive = value;
                                });
                              },
                              activeColor: Colors.green,
                            ),
                            Text(
                              _isActive ? 'เปิด' : 'ปิด',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                color: _isActive ? Colors.green : Colors.grey,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    // อีเมล
                    Card(
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.email, color: Colors.grey),
                                SizedBox(width: 12),
                                Text(
                                  'อีเมลสำหรับการแจ้งเตือน',
                                  style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w500),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _emailController,
                              decoration: const InputDecoration(
                                labelText: 'อีเมล',
                                hintText: 'example@gmail.com',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.emailAddress,
                              validator: (value) {
                                if (value == null || value.trim().isEmpty) {
                                  return 'กรุณากรอกอีเมล';
                                }
                                if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$')
                                    .hasMatch(value.trim())) {
                                  return 'กรุณากรอกอีเมลให้ถูกต้อง';
                                }
                                return null;
                              },
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    // ความถี่การแจ้งเตือน
                    Card(
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.schedule, color: Colors.grey),
                                SizedBox(width: 12),
                                Text(
                                  'ความถี่การแจ้งเตือน',
                                  style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w500),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            DropdownButtonFormField<NotificationFrequency>(
                              value: _selectedFrequency,
                              decoration: const InputDecoration(
                                labelText: 'ความถี่การแจ้งเตือน',
                                border: OutlineInputBorder(),
                              ),
                              items:
                                  NotificationFrequency.values.map((frequency) {
                                return DropdownMenuItem(
                                  value: frequency,
                                  child: Text(_getFrequencyText(frequency)),
                                );
                              }).toList(),
                              onChanged: (value) {
                                if (value != null) {
                                  setState(() {
                                    _selectedFrequency = value;
                                  });
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    // ความถี่การตรวจสอบ
                    Card(
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.timer, color: Colors.grey),
                                SizedBox(width: 12),
                                Text(
                                  'ความถี่การตรวจสอบ',
                                  style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w500),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '⚠️ หมายเหตุ: การตรวจสอบบ่อยเกินไปอาจทำให้บัญชีถูกแบน',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.orange.shade700,
                                fontStyle: FontStyle.italic,
                              ),
                            ),
                            const SizedBox(height: 12),
                            DropdownButtonFormField<int>(
                              value: _selectedCheckFrequency,
                              decoration: const InputDecoration(
                                labelText: 'ความถี่การตรวจสอบ',
                                border: OutlineInputBorder(),
                              ),
                              items: [
                                DropdownMenuItem(
                                    value: 0,
                                    child: Text(_getCheckFrequencyText(0))),
                                DropdownMenuItem(
                                    value: 1,
                                    child: Text(_getCheckFrequencyText(1))),
                                DropdownMenuItem(
                                    value: 2,
                                    child: Text(_getCheckFrequencyText(2))),
                                DropdownMenuItem(
                                    value: 3,
                                    child: Text(_getCheckFrequencyText(3))),
                                DropdownMenuItem(
                                    value: 4,
                                    child: Text(_getCheckFrequencyText(4))),
                                DropdownMenuItem(
                                    value: 5,
                                    child: Text(_getCheckFrequencyText(5))),
                                DropdownMenuItem(
                                    value: 6,
                                    child: Text(_getCheckFrequencyText(6))),
                                DropdownMenuItem(
                                    value: 7,
                                    child: Text(_getCheckFrequencyText(7))),
                              ],
                              onChanged: (value) {
                                if (value != null) {
                                  setState(() {
                                    _selectedCheckFrequency = value;
                                  });
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    // รายการ Usernames
                    Card(
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.people, color: Colors.grey),
                                const SizedBox(width: 12),
                                const Text(
                                  'รายการ Usernames',
                                  style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w500),
                                ),
                                const Spacer(),
                                ElevatedButton.icon(
                                  onPressed: _addUsername,
                                  icon: const Icon(Icons.add, size: 16),
                                  label: const Text('เพิ่ม'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.green,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 8),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            if (_usernames.isEmpty)
                              Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade50,
                                  borderRadius: BorderRadius.circular(8),
                                  border:
                                      Border.all(color: Colors.grey.shade300),
                                ),
                                child: const Center(
                                  child: Text(
                                    'ยังไม่มี username\nกรุณาเพิ่ม username อย่างน้อย 1 รายการ',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(color: Colors.grey),
                                  ),
                                ),
                              )
                            else
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: _usernames.map((username) {
                                  return Chip(
                                    label: Text('@$username'),
                                    backgroundColor: Colors.deepPurple.shade50,
                                    side: BorderSide(
                                        color: Colors.deepPurple.shade200),
                                    deleteIcon:
                                        const Icon(Icons.close, size: 16),
                                    onDeleted: () => _removeUsername(username),
                                  );
                                }).toList(),
                              ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 30),

                    // ปุ่มบันทึก
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isLoading ? null : _saveSettings,
                        icon: _isLoading
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.save),
                        label: Text(
                            _isLoading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.deepPurple,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),
    );
  }
}
